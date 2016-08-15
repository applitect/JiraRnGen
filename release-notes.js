var https = require('https');
var fs = require("fs");
var stdio = require("stdio");
var logo = require("./image/logo.json");
var sendmail = require("./util/sendmail");
var juice = require('juice');

var args = stdio.getopt({
    'email': {description: 'Send email'},
    'sendTo' : {key: 's', description: 'email address to send to', args: 1},
    'username' : {key: 'u', description: 'Jira Username', mandatory: true, args: 1},
    'password' : {key: 'p', description: 'Jira Password', mandatory: true, args: 1},
    'hostName' : {key: 'n', description: 'Jira Host [blah.atlassian.net]', mandatory: true, args: 1},
    'hostPort' : {key: 't', description: 'Port for Jira host', args:1},
    'context' : {key: 'c', description: 'Context for Jira Url', args: 1},
    'fixVersion' : {key: 'f', description: 'Version name which to create release notes', mandatory: true, args: 1},
    'component' : {key: 'm', description: 'Only generate release notes with specified comma separated component(s) listed', args: 1}
});

var fixVersion = args.fixVersion;
var context = "/";
if (args.context) {
    context = '/' + args.context + '/';
}

var options = {
        host: args.hostName,
        port: args.hostPort || 443,
        headers: {
            'Authorization' : 'Basic ' + new Buffer(args.username + ':' + args.password).toString('base64')
        }
    };

function formatDate(date) {
    return date.substring(0,10);
}

function buildEmail(release, issues) {
    var issueType = {};
    var css = fs.readFileSync("stylesheet/style.css");
    var html = '<!DOCTYPE html> \n' +
        '<html> \n' +
        '<head> \n' +
        '<meta charset="UTF-8"> \n' +
        '<title>Release Notes ' + release.name + '</title> \n' +
        '<style>' +
        css.toString() +
        '</style>\n' +
        '</head> \n' +
        '<body>\n';
    if (args.email) {
        html += '<img id="logo" width="' + logo.width + '" height= "' + logo.height + '" src="cid:logo" alt="' + logo.alt + '">';
    } else {
        html += '<img id="logo" width="' + logo.width + '" height= "' + logo.height + '" src="data:' + logo.type + ';' + logo.enc + ',' + logo.data + '" alt="' + logo.alt + '">';
    }
    html +=
        '<h1>Release Notes</h1>\n' +
        '<h4>Version : <span class="version">' + release.name + '</span></h4>\n' +
        '<h4>Date : ' + new Date() + '</h4>\n';
        if (!args.email) {
            html += '<a href="#" class="expand-all">Expand All</a>';
        }

    for(var i = 0, len = issues.length; i < len; i++) {
        var issue = issues[i];
        if (issue !== undefined) {
            if (issue.changelog !== undefined) {
                var hist = issue.changelog.histories;
                var changers = {};
                for (var c = 0; c < hist.length; c++) {
                    var change = hist[c];
                    changers[change.author.name] = 1;
                }
                issue.changers = Object.keys(changers);
            }
            issueType[issue.fields.issuetype.name] = issueType[issue.fields.issuetype.name] || [];
            issueType[issue.fields.issuetype.name].unshift(issue);
        }
    }

    var keys = Object.keys(issueType);
    keys.sort();
    for (var k = 0; k < keys.length; k++) {
        var type = keys[k];
        var typedIssues = issueType[type];
        html += '<h3>' + type + '(s)</h3>\n';
        for(i = 0, len = typedIssues.length; i < len; i++) {
            var issue = typedIssues[i];
            var link = 'https://' + args.hostName + '/browse/' + issue.key;
            html +=
                '<div class="issue" tabindex="0"><span class="issue-arrow"> &#8227; &nbsp; </span><a href="' + link + '">' + issue.key + '</a> - ' + issue.fields.summary + ' (<i>' + issue.changers + '</i>)</div>';
            html += '<div class="child">\n' +
                '<table>\n' +
                '<td><span class="header">Priority:</span> ' + issue.fields.priority.name + '</td><td><span class="header">Components:</span> ';
            if (issue.fields.components !== null) {
                var comps = issue.fields.components;
                for (var c = 0; c < comps.length; c++) {
                    var comp = comps[c];
                    html += '<span class="component">' + comp.name + '</span> ';
                }
            }
            html += ' </td>\n' +
                '</tr><tr>\n';
            if (issue.fields.reporter.displayName !== null && issue.fields.creator.displayName === issue.fields.reporter.displayName) {
                html += '<td colspan="2"><span class="header">Created by:</span> ' + issue.fields.creator.displayName + '</td>\n';
            } else {
                html += '<td><span class="header">Created by:</span> ' + issue.fields.creator.displayName + '</td><td><span class="header">Reported by:</span> ' + issue.fields.reporter.displayName + '</td>\n';

            }
            html += '</tr><tr>\n';
            if (issue.fields.duedate !== null) {
                html += '<td><span class="header">Created date:</span> ' + formatDate(issue.fields.created) + '</td><td><span class="header">Due date:</span> ' + issue.fields.duedate + '</td>\n';
            } else {
                html += '<td colspan="2"><span class="header">Created date:</span> ' + formatDate(issue.fields.created) + '</td>\n';
            }
            html += '</tr><tr>\n';
            if (issue.fields.description !== null) {
                // Replace all new lines with the null character so the description is on one line -- easier regex
                var desc = issue.fields.description.replace(/(?:\r\n|\r|\n)/g, "\0");
                // Replace all {code} blocks with <pre> blocks
                var codeRegex = /(\{code\})(.*?)(\{code\})/g;
                desc = desc.replace(codeRegex, function(a,b,c) { return "<pre>" + c.replace(/\0/g, "\n") + "</pre>";});
                // Surround all ordered lists with <ol> and within blocks replace nulls with new lines
                desc = desc.replace(/\0([\t ]*#[^\0]*(\0[\t ]*#[^\0]*)*)/g, "\n<ol>\n$1\n</ol>\n");
                // Surround all unordered lists with <ul> and within blocks replace nulls with new lines
                desc = desc.replace(/\0([\t ]*\*[^\0]*(\0[\t ]*\*[^\0]*)*)/g, "\n<ul>\n$1\n</ul>\n");

                // Now we want to work line by line, replace the null character back with new lines.
                desc = desc.replace(/\0/g,"<br/>\n");

                // Find all bolded words (surrounded by *) and replace with <strong>
                var boldRegex = /\*(.*?)\*/g;
                desc = desc.replace(boldRegex, "<strong>$1</strong>");
                // Find all italicized words (surrounded by _) and replace with <i>
                var itRegex = /_(.*?)_/g;
                desc = desc.replace(itRegex, "<i>$1</i>");
                // Find all lines that start with * and turn it into a list item
                // TODO: need to handle **, ***, **** etc.
                var listRegex = /[\t ]*\*(.*)/g;
                desc = desc.replace(listRegex, "<li>$1</li>");
                // Find all lines that start with # and turn it into a list item
                // TODO: need to handle ##, ###, #### etc.
                listRegex = /[\t ]*#(.*)/g;
                desc = desc.replace(listRegex, "<li>$1</li>");

                // Find all block quotes, lines starting with bq. and wrap <quote> around them.
                desc = desc.replace(/[\t ]*bq[.] (.*)/, "<quote>$1</quote>");

                html += '<td colspan="2" class="description"><span class="header">Description: </span><div>' + desc + '</div></td>\n';
            } else {
                 html += '<td colspan="2"><span class="header">Description:</span> <i>None</i></td>\n';
            }
            html += '</tr></table>' +
                '</div>\n';
        }
    }
    html += '</body>\n</html>';

    // If sending as an email, we must inline the style tags to make this work with most mail clients
    if (args.email) {
        return juice(html, {preserveImportant:true, removeStyleTags:false});
    } else {
        return html;
    }
}

function getVersionInfo(id, issues) {
    options.path = context + 'rest/api/2/version/' + id;
    var request = https.get(options, function(res) {
        var body = "";
        res.on('data', function(data) {
            body += data;
        });
        res.on('end', function() {
            var json = JSON.parse(body);
            var email = buildEmail(json, issues);
            if (args.email) {
                if (args.sendTo === undefined) {
                    console.log("to send email you must set sendTo");
                    return;
                }
                sendmail.send(fixVersion, args.sendTo, email, logo);
            } else {
                console.log(email);
            }
        });
        res.on('error', function(e) {
            console.log("Got error: " + e.message);
        });
    });
}

// Set up the Jira search function to locate the specific issues to be reported
options.path = context + 'rest/api/2/search?jql=fixVersion=' + encodeURI(fixVersion);
if (args.component) {
    options.path = options.path + encodeURI(' AND component in (' + args.component + ')');
}
options.path = options.path + '&expand=changelog';

var request = https.get(options, function(res) {
    if (res.statusCode < 200 || res.statusCode > 299) {
        console.log("Unable to communicate with Jira instance. Status code: " + res.statusCode);
        return;
    }
    var body = "";
    res.on('data', function(data) {
        body += data;
    });
    res.on('end', function() {
        var json = JSON.parse(body);
        var issues = json.issues;
        if (issues === undefined || issues.length === 0) {
            console.log("No issues found for version: " + fixVersion);
            return;
        }
        var id = issues[0].fields.fixVersions[0].id;
        getVersionInfo(id, issues);
    });
    res.on('error', function(e) {
        console.log("Unable to communicate with Jira: " + e.message);
    });
});

