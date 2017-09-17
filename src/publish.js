// Author: Ilya Ig. Petrov, ilyaigpetrov@gmail.com, 2017
'use strict';

const Assert = require('assert');
const Xml2Js = require('xml2js');
const Logger = require('./logger');
const Utils = require('./utils');
const Generator = require('./generator');
const GitHub = require('./github');

// const REPO_URL = 'https://api.github.com/repos/anticensorship-russia/generated-pac-scripts';
const REPO_URL = 'https://api.github.com/repos/anticensority/for-testing';

function strToDate(str) {

  // 2016-12-29 14:00:00 +0000 -> 2016/12/29 14:00:00 +0000
  return new Date( str.replace(/-/, '/').replace(/-/, '/') );

}

async function ifShouldUpdateFromSourcesAsync(lastFetchDate) {
  // TBD: The CVS file is about 7MB in size. Instead of downloading it every 2h we may check first if it was updated.
  // Unfortuntely GoogleScript doesn't allow to make HEAD requests so we have to use RSS feeds for checking.
  Logger.log('LAST FETCH DATE: ' + lastFetchDate);

  var blockProviders = [
    {
      urls: ['https://raw.githubusercontent.com/zapret-info/z-i/master/dump.csv'],
      rss: 'https://github.com/zapret-info/z-i/commits/master.atom',
      /* RSS update date:
      updateElementPath: ['updated'],
      dateFormat: 'ISO 8601'
      if (provider.dateFormat === 'ISO 8601') {
        // Google Script can't handle this format.
        // 2016-01-06T14:44:10+01:00 -> 2016/01/06 14:44:10 +01:00
        dateString = dateString.replace(/-/,'/').replace(/-/,'/').replace(/T/,' ').replace(/\+/,' \+').replace('-', ' -').replace(/Z/,' +00');
      }
      */
      updateElementPath: ['entry', 0, 'title', 0], // Updated: 2016-12-29 14:00:00 +0000
    },
    {
      urls: [
        'http://sourceforge.net/p/z-i/code-0/HEAD/tree/dump.csv?format=raw',
        'https://svn.code.sf.net/p/z-i/code-0/dump.csv'
      ],
      //rss: 'http://sourceforge.net/p/z-i/activity/feed?source=project_activity', // Still works.
      rss: 'https://sourceforge.net/p/z-i/code-0/feed',
      /* RSS update date:
      updateElementPath: ['channel', 'lastBuildDate']
      */
      updateElementPath: ['channel', 0, 'item', 0, 'title', 0] // Updated: 2016-12-29 14:00:00 +0000
    },
    {
      urls: ['https://www.assembla.com/spaces/z-i/git/source/master/dump.csv?_format=raw'],
      rss: 'https://app.assembla.com/spaces/z-i/stream.rss',
      updateElementPath: ['channel', 0, 'item', 1, 'title', 0] // Changeset [f3a5b94023f]: Updated: 2016-12-29 14:00:00 +0000 Branch: master
    }
  ];

  const urlsObjects = [];
  do {
    var provider = blockProviders.shift();
    if ( provider.rss && provider.updateElementPath ) {
      var res = await Utils.fetch(provider.rss);
      if ( res.ifOk ) {
        var xml = res.content;
        var [err, document] = await new Promise((resolve) => Xml2Js.parseString(
          xml,
          {
            explicitRoot: false,
            trim: true,
          },
          (...args) => resolve(args),
        ));
        if (err) {
          throw err;
        }
        var parent = document;
        var element;
        do {
          element = provider.updateElementPath.shift()
          parent = parent[element];
        } while(provider.updateElementPath.length);
        const title = parent;
        const groups = /Updated:\s+(\d\d\d\d-\d\d-\d\d\s+\d\d:\d\d:\d\d\s+[+-]\d\d\d\d)/.exec(title);
        var dateString = groups && groups[1];
        Logger.log(provider.urls[0] + ' ' + dateString);
        if (!dateString) {
          continue;
        }
        if ( !lastFetchDate || strToDate( dateString ) > strToDate( lastFetchDate )) {
          urlsObjects.push({
            urls: provider.urls,
            date: strToDate(dateString),
            dateString: dateString
          });
        }
      }
    }
  } while(blockProviders.length);
  if (urlsObjects.length) {
    return urlsObjects.sort( function(a, b) { return a.date - b.date; } );
  }
  return false;

}

/*
function writeToGoogleDrive(pacData) {

  var pacName = 'anticensority-1.0.pac';
  var pacMime = 'application/x-ns-proxy-autoconfig';
  var files = DriveApp.getFilesByName(pacName);
  if (files.hasNext()) {
    while(files.hasNext()) {
      var file = files.next();
      file.setContent(pacData);
    }
  } else {
    DriveApp.createFile(pacName, pacData, pacMime);
  }

  return {};

}
*/

function forceUpdatePacScriptAsync() {

  updatePacScriptAsync(true);

}

async function updatePacScriptAsync(ifForced) {

  var start = new Date();

  let lastFetchDate = undefined;
  if (!ifForced) {
    const res =  await Utils.fetch(`${REPO_URL}/commits`);
    lastFetchDate = JSON.parse(res.content)[0].commit.message.replace(/^Updated: /, '');
  }

  const sources = await ifShouldUpdateFromSourcesAsync(lastFetchDate);
  if (!sources) {
    Logger.log('Too early to update. New version is not ready.');
    return;
  }

  var result = await Generator.generatePacScriptAsync(sources);
  if (result.error) {
    throw result.error;
  }
  const pacData = result.content;

  Logger.log('PAC script generated. Saving...');

  var [err] = await GitHub.uploadToGitHubAsync(REPO_URL, pacData, result.dateString);
  if (err) {
    throw err;
  }

  Logger.log('TIME:' + (new Date() - start));

}

function testPunycode() {

  Logger.log( punycode.toASCII('www.76автобар.рф') );

}

// MAIN

let ifForce = false;
const args = process.argv.slice(2);
if (args.length) {
  Assert(args.length === 1);
  const a = args.shift();
  Assert(a === '--force');
  ifForce = true;
}

updatePacScriptAsync(ifForce);
