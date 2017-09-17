'use strict';

const fetch = require('node-fetch');

var Utils = {};
module.exports = Utils;

Utils.mandatory = function mandatory () {

  throw new TypeError('Missing required argument. Be explicit if you swallow errors.');

};

Utils.ifSuccessfulCode = (status) =>
  status >= 200 && status < 300 || status === 304;

Utils.fetch = async function UtilsFetch(url, encoding) {

  const res = await fetch(url);
  const code = res.status;
  const text = await res.text();
  const result = {
    response: {
      getResponseCode: () => code,
      getContentText: () => text,
    },
    code,
    ifOk: Utils.ifSuccessfulCode(code),
  };
  if( result.ifOk ) {
    result.content = text;
  }
  return result;

};

/*
Requirements:
  fun returns plain stringifiable object: { ofOk: Boolean, ... }
  Don't expect methods on this object!
*/
/*
Utils.backedUp = function backedUp(fun, key) {
  // Key must depend on fun and args!
  // Don't forget that JSON.stringify for objects is not persistent!

  key = key || fun.name;
  return function() {

    var result = fun.apply(this, arguments);
    const userProps = PropertiesService.getUserProperties();
    if (result.ifOk) {
      Logger.log('Result is OK, backup ignored.')
      userProps.setProperty(key, JSON.stringify(result));
      return result;
    }
    Logger.log('Result is not OK, hitting backup...')
    var backup = JSON.parse(userProps.getProperty(key));
    if (backup) {
      backup.ifFromBackup = true;
      return backup;
    }
    return result;

  }

}
*/

/*
function purgeUserProps() {

  const userProps = PropertiesService.getUserProperties();
  userProps.deleteAllProperties();

}
*/
