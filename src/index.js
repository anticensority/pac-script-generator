'use strict';

const Assert = require('assert');
const Airbrake = require('airbrake')

const AB_PROJECT_ID = process.env.AIRBRAKE_PROJECT_ID;
const AB_API_KEY = process.env.AIRBRAKE_API_KEY;
Assert(AB_PROJECT_ID && AB_API_KEY, 'Provide Airbrake credentials!');

const airbrake = Airbrake.createClient(
  AB_PROJECT_ID,
  AB_API_KEY,
);
airbrake.handleExceptions();

const Publisher = require('./publisher');

let ifForce = false;
const args = process.argv.slice(2);
if (args.length) {
  Assert(args.length === 1);
  const a = args.shift();
  Assert(a === '--force');
  ifForce = true;
}

Publisher.updatePacScriptAsync(ifForce);
