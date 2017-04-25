#!/bin/sh
node release-notes.js --username "$JIRA_USER" --password "$JIRA_PASS" -n "$JIRA_HOST" "$@"
