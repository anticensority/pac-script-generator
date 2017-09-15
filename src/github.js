'use strict';

/*
Inspired by https://mashe.hawksey.info/2016/08/working-with-github-repository-files-using-google-apps-script-examples-in-getting-writing-and-committing-content/

HOWTO INSTALL

1. Create an application on github, it must have client id and client secret (or use already created)
   and set "Authorization callback URL" as https://script.google.com/macros/d/<SCRIPT_ID>/usercallback
2. This window > File > Project properties > Script properties > Add GH_CLIENT_ID and GH_CLIENT_SECRET
3. Uncomment functions at the bottom of this file.
4. This window > Select function > getGitHubAuthURL > run > get url from logs > visit it and auth with github > receive "success".
5. Configure your triggers.

*/

var githubExports = (function() {

  const REPO_URL = 'https://api.github.com/repos/anticensority/for-testing/';
  // const REPO_URL = 'https://api.github.com/repos/anticensorship-russia/generated-pac-scripts/';

  function getGitHubService() {

    return OAuth2.createService('GitHub')
    .setAuthorizationBaseUrl("https://github.com/login/oauth/authorize")
    .setTokenUrl("https://github.com/login/oauth/access_token")
    .setClientId(PropertiesService.getScriptProperties().getProperty('GH_CLIENT_ID'))
    .setClientSecret(PropertiesService.getScriptProperties().getProperty('GH_CLIENT_SECRET'))
    .setScope(['repo'])
    .setCallbackFunction('authCallbackGit')
    .setPropertyStore(PropertiesService.getUserProperties())

  }

  /**
  * Logs the redict URI to register in the Google Developers Console, etc.
  */
  function getGitHubAuthURL() {

    var service = getGitHubService();
    var authorizationUrl = service.getAuthorizationUrl();
    Logger.log(authorizationUrl);
    return '<a href="' + authorizationUrl + '">Sign in with GitHub</a>'

  }

  /**
  * Handles the OAuth callback.
  */
  function authCallbackGit(request) {

    const ghService = getGitHubService();
    const authorized = ghService.handleCallback(request);
    if (!authorized) {
      return HtmlService.createHtmlOutput('Denied');
    }
    return HtmlService.createHtmlOutput('Success!');

  }

  function _request(token, method, path, data) {

    const config = {
      method: method,
      muteHttpExceptions: true,
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token
      },
      responseType: 'json'
    };
    if (data) {
      config.payload = JSON.stringify(data);
    }

    return UrlFetchApp.fetch( REPO_URL + path , config );

  }

  function checkIfError(response) {

    const code = response.getResponseCode();
    if (!ifSuccessfulCode(code)) {
      const err = new Error(code + ': ' + response.getContentText());
      err.code = code;
      return err;
    }
    Logger.log(code);
    return null;

  }

  function uploadToGitHub(data, dateStr) {

    const token = getGitHubService().getAccessToken();

    var response = _request(token, 'GET', 'readme/');
    var err = checkIfError(response);
    if (err) {
      return { error: err };
    }
    const readme = JSON.parse(response.getContentText());

    var response = _request(token, 'POST', 'git/trees',
      {
        tree: [{
          path: 'anticensority.pac',
          mode: '100644',
          type: 'blob',
          content: data
        },
        {
          path: readme.path,
          mode: '100644',
          type: 'blob',
          sha: readme.sha
        }]
      }
     );

    var err = checkIfError(response);
    if (err) {
      return { error: err };
    }

    const tree = JSON.parse(response.getContentText());
    /*
    {
    "sha":"d418cebf2c07684fc447740f3d794085d52a73c4",
    "url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/trees/d418cebf2c07684fc447740f3d794085d52a73c4",
    "tree":[{"path":"on-switches-0.17.pac","mode":"100644","type":"blob","sha":"3d948d13a8673b687b755ee4ca0b62c1e9d451c5","size":16,"url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/blobs/3d948d13a8673b687b755ee4ca0b62c1e9d451c5"}],
    "truncated":false
    }
    */
    var response = _request(token, 'POST', 'git/commits',
      {
        message: 'Updated: ' + dateStr,
        tree: tree.sha
      }
    );

    var err = checkIfError(response);
    if (err) {
      return { error: err };
    }

    /*
    {
    "sha":"23d7ffc5c3ba695e4446166a31969ccd4e038b5e",
    "url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/commits/23d7ffc5c3ba695e4446166a31969ccd4e038b5e",
    "html_url":"https://github.com/anticensorship-russia/pac-scripts/commit/23d7ffc5c3ba695e4446166a31969ccd4e038b5e",
    "author":{"name":"Ilya Ig. Petrov","email":"ilyaigpetrov@gmail.com","date":"2017-01-01T22:38:20Z"},
    "committer":{"name":"Ilya Ig. Petrov","email":"ilyaigpetrov@gmail.com","date":"2017-01-01T22:38:20Z"},
    "tree":{"sha":"d418cebf2c07684fc447740f3d794085d52a73c4",
    "url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/trees/d418cebf2c07684fc447740f3d794085d52a73c4"},
    "message":"This is the only commit that is overriden",
    "parents":[]
    }
    */
    const commit = JSON.parse(response.getContentText());

    var response = _request(token, 'PATCH', 'git/refs/heads/master',
      {
        sha: commit.sha,
        force: true
      }
    );

    var err = checkIfError(response);
    if (err) {
      return { error: err };
    }

    return {};

  }

  return {
    uploadToGitHub: uploadToGitHub,
    getGitHubAuthURL: getGitHubAuthURL,
    authCallbackGit: authCallbackGit,
  };

})();

/*
function getGitHubAuthURL() {
  return githubExports.getGitHubAuthURL();
}
function authCallbackGit(request) {
  return githubExports.authCallbackGit(request);
}
*/
