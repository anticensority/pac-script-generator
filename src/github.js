'use strict';

const Assert = require('assert');
const Fetch = require('node-fetch');
const Logger = require('./logger');
const Utils = require('./utils');

module.exports = (function() {

  // TOKEN is procured via oauth + GH_CLIENT + GH_SECRET,
  // you may use lib like npm/simple-oauth2.
  const TOKEN = process.env.GH_TOKEN;
  Assert(TOKEN, 'GH_TOKEN env variable is required, see sources.');

  function checkIfError(response) {

    const code = response.getResponseCode();
    if (!Utils.ifSuccessfulCode(code)) {
      const err = new Error(code + ': ' + response.getContentText());
      err.code = code;
      return err;
    }
    Logger.log(code);
    return null;

  }

  async function uploadToGitHubAsync(repoUrl, data, dateStr) {

    async function _request(token, method, path, data) {

      const config = {
        method,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
      };
      if (data) {
        Object.assign(config, {
          body: JSON.stringify(data),
        });
      }

      const res = await Fetch(repoUrl + path , config);
      const text = await res.text();
      return {
        getResponseCode: () => res.status,
        getContentText: () => text,
      };

    }

    let err;
    let token;
    [err, token] = await getGitHubService().getAccessTokenAsync();
    if (err) {
      return [err];
    }
    if (!token) {
      return [new Error('No token!')];
    }
    Logger.log('Got token.');

    var response = await _request(token, 'GET', '/readme/');
    err = checkIfError(response);
    if (err) {
      return [err];
    }
    const readme = JSON.parse(response.getContentText());
    Logger.log('Got README.');

    var response = await _request(token, 'POST', '/git/trees',
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

    err = checkIfError(response);
    if (err) {
      return [err];
    }
    Logger.log('POSTed to git/trees.');

    const tree = JSON.parse(response.getContentText());
    /*
    {
    "sha":"d418cebf2c07684fc447740f3d794085d52a73c4",
    "url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/trees/d418cebf2c07684fc447740f3d794085d52a73c4",
    "tree":[{"path":"on-switches-0.17.pac","mode":"100644","type":"blob","sha":"3d948d13a8673b687b755ee4ca0b62c1e9d451c5","size":16,"url":"https://api.github.com/repos/anticensorship-russia/pac-scripts/git/blobs/3d948d13a8673b687b755ee4ca0b62c1e9d451c5"}],
    "truncated":false
    }
    */
    var response = await _request(token, 'POST', '/git/commits',
      {
        message: 'Updated: ' + dateStr,
        tree: tree.sha
      }
    );
    Logger.log('POSTed to git/commits.');

    err = checkIfError(response);
    if (err) {
      return [err];
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

    var response = await _request(token, 'PATCH', '/git/refs/heads/master',
      {
        sha: commit.sha,
        force: true
      }
    );
    Logger.log('PATCHed master.');

    err = checkIfError(response);
    if (err) {
      return [err];
    }

    Logger.log('Reached the final of upload.');
    return [];

  }

  return {
    uploadToGitHubAsync,
  };

})();
