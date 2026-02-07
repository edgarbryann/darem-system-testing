var express = require('express')
var connection = require('../dabatase.js')
var router = express.Router()


/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('profile', { title: 'Express' });
});
router.get('/tables', function (req, res, next) {
  connection.query('SELECT `logs`, `f_id`, `raw_fname`, `raw_mname`, `raw_lname` FROM `qp_farmer_raw` WHERE 1', function (err, rows) {
    if (err) {
      req.flash('error', err)
      res.render('tables', { data: '' })
    } else {
      console.log(rows)
      res.render('tables', { data: rows })
    }
  })
})


module.exports = router;
