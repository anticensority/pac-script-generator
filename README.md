# Anticensority PAC-Script Generator

Script to run on a server to generate anticensority PAC-script.

## Environment Variables

* GH_REPO — Repo to which generated PAC-script will be uploaded.
* GH_TOKEN — OAuth2 token that gives write access to GH_REPO (scope 'repo').

## Deploy to Heroku

1. First, explicitly select a repo branch "production" (so it appear in the tab address bar).
2. In new tab: [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
3. Manage app -> Resources -> Heroku Scheduler -> Add new job -> input "npm generate" after $ -> Save

