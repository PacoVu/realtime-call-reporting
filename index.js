var path = require('path')
require('dotenv').load();

var express = require('express');
var session = require('express-session');

var app = express();

app.use(session({ secret: 'this-is-a-secret-token', cookie: { maxAge: 24 * 60 * 60 * 1000 }}));
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

var router = require('./router');

app.get('/', function (req, res) {
  if (req.session.extensionId != 0)
    router.logout(req, res)
  else{
    res.render('index')
  }
})

app.get('/settings', function (req, res) {
  if (req.session.extensionId != 0)
    router.loadSettingsPage(req, res)
  else{
    res.render('index')
  }
})

app.get('/login', function (req, res) {
  req.session.cookie = { maxAge: 24 * 60 * 60 * 1000 }
  if (!req.session.hasOwnProperty("userId"))
    req.session.userId = 0;
    if (!req.session.hasOwnProperty("extensionId"))
      req.session.extensionId = 0;
  router.loadLogin(req, res)
})

// RC login callback
app.get('/oauth2callback', function(req, res){
  console.log("callback redirected")
  router.login(req, res)
})

app.get('/index', function (req, res) {
  console.log('load option page /')
  if (req.query.n != undefined && req.query.n == 1){
    router.logout(req, res)
  }else {
    res.render('index')
  }
})

// Loaded after RC login successfully
app.get('/main', function (req, res) {
  console.log('loadMainPage??')
  if (req.session.extensionId != 0)
    router.loadMainPage(req, res)
  else{
    res.render('index')
  }
})

app.get('/calllogs', function (req, res) {
  router.loadCallLogsPage(req, res)
})

app.get('/reportings', function (req, res) {
  router.loadReportingsPage(req, res)
})

app.get('/get_account_extensions', function (req, res) {
  console.log("get_account_extensions")
  router.getAccountExtensions(req, res)
})

app.get('/read_extensions', function (req, res) {
  console.log("read_extensions")
  router.readExtensions(req, res)
})
app.get('/reset_account_subscription', function (req, res) {
  console.log("reset_account_subscription")
  router.resetAccountSubscription(req, res)
})
app.get('/add_extension', function (req, res) {
  console.log("add_extension")
  router.addExtension(req, res)
})
app.get('/remove_extension', function (req, res) {
  console.log("add_extension")
  router.removeExtension(req, res)
})
app.get('/poll_calls', function (req, res){
  //console.log("poll_calls")
  router.pollActiveCalls(req, res)
})

app.post('/read_calllogs', function (req, res){
  console.log("read_calllogs")
  router.readCallLogs(req, res)
})

app.post('/add_account_extensions', function (req, res){
  console.log("add_account_extensions")
  router.adminAddExtensions(req, res)
})

app.post('/remove_account_extensions', function (req, res){
  console.log("add_account_extensions")
  router.adminRemoveExtensions(req, res)
})

app.post('/read_reports', function (req, res){
  //console.log("read_reports")
  router.readReports(req, res)
})

app.get('/check_subscription', function (req, res){
  //console.log("poll_calls")
  //router.checkSubscription()
  res.send("ok")
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
            var activeAccounts = router.getEngine()
            if (activeAccounts.length){
              console.log(activeAccounts[0].subscriptionId + " == " + jsonObj.subscriptionId)
              var account = activeAccounts.find(o => o.subscriptionId === jsonObj.subscriptionId)
              if (account)
                account.processNotification(jsonObj)
              else
                console.log("Not my notification!!!")
            }else{
              console.log("Export does not work")
            }
            //router.processNotification(jsonObj)
        });
    }
})
// User logs out from demo app
app.get('/logout', function (req, res) {
  console.log('logout why here?')
  router.logout(req, res)
})

// User chooses the About option
app.get('/about', function (req, res) {
  router.loadAboutPage(req, res)
})
