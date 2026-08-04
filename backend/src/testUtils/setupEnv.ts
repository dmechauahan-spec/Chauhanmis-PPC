import 'dotenv/config';

// Tests run against DATABASE_URL_TEST when provided, so the suite never
// touches the dev/prod database. See README "Test strategy".
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}
