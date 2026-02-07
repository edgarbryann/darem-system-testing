// app.js
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const logger = require('morgan');
const flash = require('express-flash');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const nodeRoutes = require('./routes/index');
const hbs = require('hbs');

const app = express();

// If behind a proxy and you want secure cookies in prod:
app.set('trust proxy', 1);

// ===== Handlebars helpers =====
hbs.registerHelper('formatCurrency', function (value) {
  return value.toString().replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
});
hbs.registerHelper('redorgreen', function (value1, options) {
  return value1 <= 0 ? options.fn(this) : options.inverse(this);
});
hbs.registerHelper('redorgreen1', function (value1, value2, options) {
  return value1 < value2 ? options.fn(this) : options.inverse(this);
});

// ===== Views / static =====
app.set('views', path.join(__dirname, 'views'));
app.set('public', path.join(__dirname, 'public'));
app.set('view engine', 'hbs');

app.use(logger('dev'));

// Use Express body parsers (no need for body-parser package)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ===== Sessions (single config only) =====
app.use(
  session({
    secret: 'weblesson',           // keep one secret
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 60 * 1000,           // 1 minute (adjust as needed)
      secure: process.env.NODE_ENV === 'production', // HTTPS only in prod
    },
  })
);

// NOTE: Removed old express-validator global middleware.
// In v6+, validators are added per-route, e.g. in routes/index.js:
//   const { body, query, validationResult } = require('express-validator');

app.use(flash());

// ===== Routes =====
app.use('/', nodeRoutes);

// ===== 404 =====
app.use(function (req, res, next) {
  next(createError(404));
});

// ===== Error handler =====
app.use(function (err, req, res, next) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};
  res.status(err.status || 500);
  res.render('error');
});

// ===== Server =====
app.listen(5555, function () {
  console.log('Node server running on port : 5555');
});

module.exports = app;
