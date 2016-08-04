var emailConfig = require("../conf/config.json");
var helper = require('sendgrid').mail;
var sg = require('sendgrid')(emailConfig.sendGridApiKey);

exports.send = function(fixVersion, sendTo, email, logo) {
    var from_email = new helper.Email(emailConfig.fromAddr);
    var to_email = new helper.Email(sendTo);
    var subject = "Release Notes for " + fixVersion;
    var content = new helper.Content('text/html', email);
    var mail = new helper.Mail(from_email, subject, to_email, content);
    var attachment = new helper.Attachment();
    attachment.setFilename('logo.png');
    attachment.setType(logo.type);
    attachment.setContent(logo.data);
    attachment.setDisposition('inline');
    attachment.setContentId('logo');
    mail.addAttachment(attachment);

    var request = sg.emptyRequest({
        method: 'POST',
        path: '/v3/mail/send',
        body: mail.toJSON()
    });

    sg.API(request, function(error, response) {
        if (response.statusCode < 200 || response.statusCode > 299) {
            console.log("Unable to send email. Response: " + response.statusCode);
            console.log(response.body);
        } else {
            console.log("email sent");
        }
    });

};
