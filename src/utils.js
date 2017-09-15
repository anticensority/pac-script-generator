'use strict';

function ifSuccessfulCode(status) {
  return status >= 200 && status < 300 || status === 304;
}

var utils = {};
module.exports = utils;

utils.fetch = function fetch(url, encoding) {

  const res = UrlFetchApp.fetch(
    url,
    {
      muteHttpExceptions: true // Don't throw 404
    }
  );
  const code = res.getResponseCode();
  const result = {
    response: res,
    code: code,
    ifOk: ifSuccessfulCode(code)
  };
  if( result.ifOk ) {
    result.content = res.getContentText( encoding || 'UTF-8' );
  }
  return result;

}

/*
Requirements:
  fun returns plain stringifiable object: { ofOk: Boolean, ... }
  Don't expect methods on this object!
*/
utils.backedUp = function backedUp(fun, key) {
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

function purgeUserProps() {

  const userProps = PropertiesService.getUserProperties();
  userProps.deleteAllProperties();

}
