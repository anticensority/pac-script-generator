# Anticensority PAC-Script Generator

Script to run on a server to generate anticensority PAC-script.

## Environment Variables

* GH_REPO — Repo to which generated PAC-script will be uploaded.
* GH_TOKEN — OAuth2 token that gives write access to GH_REPO (scope 'repo').

## Deploy to Heroku

1. First, explicitly select a repo branch "production" (so it appears in the tab address bar).
2. In new tab: [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)
3. Deploy app > Manage App > Resources tab > Heroku Scheduler > Add new job > input "go run main.go" after $ > Save.

## For Anticensority Team Developers

4. Deploy tab > Connect to GitHub > connect to production branch with automatic deploys.

## Error Reporting

5. I strongly recommend configuring some error monitoring addon for Heroku.
   Unfortunately I can't advise any due to lack of long-term experience, you
   may try https://logentries.com.
