var path = require('path')
require('dotenv').load();

var express = require('express');

var app = express();

var bodyParser = require('body-parser');
var urlencoded = bodyParser.urlencoded({extended: false})

app.use(express.static(path.join(__dirname, 'public')))
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
app.use(urlencoded);

var port = process.env.PORT || 5001

var server = require('http').createServer(app);
server.listen(port);
console.log("listen to port " + port)

var Engine = require('./server');

var engine = new Engine()
engine.login()

app.get('/', function (req, res) {
  res.redirect('main')
})
/*
app.get('/index', function (req, res) {
  res.render('main')
})
*/

app.get('/main', function (req, res) {
  console.log("redirected")
  res.render('main')
})

app.get('/calllogs', function (req, res) {
  engine.loadCallLogsPage(res)
})

app.get('/reportings', function (req, res) {
  engine.loadReportingsPage(res)
})

app.get('/poll_calls', function (req, res){
  engine.pollActiveCalls(res)
})

app.post('/read_calllogs', function (req, res){
  //console.log("read_calllogs")
  engine.readCallLogs(req, res)
})

app.post('/read_reports', function (req, res){
  //console.log("read_reports")
  engine.readReports(req, res)
})

// Receiving RingCentral webhooks notifications
app.post('/webhookcallback', function(req, res) {
    if(req.headers.hasOwnProperty("validation-token")) {
        res.setHeader('Validation-Token', req.headers['validation-token']);
        res.statusCode = 200;
        res.end();
    }else{
        var body = []
        req.on('data', function(chunk) {
            body.push(chunk);
        }).on('end', function() {
            body = Buffer.concat(body).toString();
            var jsonObj = JSON.parse(body)
            engine.processNotification(jsonObj)
            res.statusCode = 200;
            res.end();
        });
    }
})
