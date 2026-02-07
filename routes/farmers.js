var express = require('express')
var connection = require('../dabatase.js')
var router = express.Router()

router.get('/', function (req, res, next) {
  connection.query('SELECT `logs`,`raw_municipality`, `raw_barangay`, CONCAT(`raw_fname`," ", `raw_mname`," ",`raw_lname`) AS fullname, `raw_gender` AS gender FROM `qp_farmer_raw` GROUP BY fullname ORDER BY logs', function (err, rows) {
    if (err) {
      req.flash('error', err)
      res.render('tables', { data: '' })
    } else {
      console.log(rows)
      res.render('tables', { data: rows })
    }
  })
})
module.exports = router