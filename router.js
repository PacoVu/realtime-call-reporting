const User = require('./usershandler.js')
const Account = require('./event-engine.js')
const pgdb = require('./db')
const async = require('async')
var users = []

function getUserIndex(id){
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (user != null){
      if (id == user.getUserId()){
        return i
      }
    }
  }
  return -1
}

function getUserIndexByExtensionId(extId){
  for (var i=0; i<users.length; i++){
    var user = users[i]
    if (extId == user.getExtensionId()){
      return i
    }
  }
  return -1
}

var activeAccounts = []
exports.activeAccounts = activeAccounts
autoStart()
function autoStart(){
  console.log("autoStart")
  var query = `SELECT * FROM rt_call_analytics_customers`
  pgdb.read(query, (err, result) => {
    if (err){
      console.error(err.message);
      createCustomersTable()
    }else{
      if (result.rows){
        async.each(result.rows,
          function(item, callback){
            console.log("account info: " + item.account_id + " / " + item.subscription_id)
            var account = new Account(item.account_id, item.subscription_id)
            account.setup((err, result) => {
              activeAccounts.push(account)
              console.log("activeAccounts.length: " + activeAccounts.length)
              callback(null, result)
            })
          },
          function (err){
            console.log("autoStart completed")
          })
      }
    }
  })
}

function createCustomersTable() {
  console.log("createCustomersTable")
  var query = 'CREATE TABLE IF NOT EXISTS rt_call_analytics_customers (account_id VARCHAR(15) PRIMARY KEY, subscription_id VARCHAR(64))'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, err.message)
      }else{
        console.log("DONE")
      }
    })
}

var router = module.exports = {
  getEngine: function(){
    return activeAccounts
  },
  loadLogin: function(req, res){
    if (req.session.userId == 0 || req.session.extensionId == 0) {
      var id = new Date().getTime()
      req.session.userId = id;
      console.log("req.session.userId: " + req.session.userId)
      var user = new User(id, req.query.env)
      users.push(user)
      var p = user.getPlatform()
      if (p != null){
        res.render('login', {
          authorize_uri: p.loginUrl(),
          redirect_uri: process.env.RC_APP_REDIRECT_URL,
          token_json: ''
        });
      }
    }else{
      var index = getUserIndex(req.session.userId)
      console.log("load main from loadLogin")
      if (index >= 0)
        res.render('main', {
            userName: users[index].getUserName(),
            isAdminUser: users[index].isAdminUser,
            extensions: users[index].extensionList,
          })
      else{
        this.forceLogin(req, res)
      }
    }
  },
  forceLogin: function(req, res){
    req.session.destroy();
    res.render('index')
  },
  login: function(req, res){
    console.log("loging in")
    var index = getUserIndex(req.session.userId)
    console.log("index " + index)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].login(req, res, function(err, extensionId){
      if (!err){
        for (var i = 0; i < users.length; i++){
          var extId = users[i].getExtensionId()
          var userId = users[i].getUserId()
          if (extId == extensionId && userId != req.session.userId){
            users[i] = null
            users.splice(i, 1);
            break
          }
        }
      }
    })
  },
  logout: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0){
      return this.forceLogin(req, res)
    }
    var thisObj = this
    users[index].logout(req, res, function(err, result){
      users[index] = null
      users.splice(index, 1);
      thisObj.forceLogin(req, res)
    })
  },
  loadAboutPage: function(req, res){
    res.render('about')
  },
  loadMainPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    console.log("index " + index)
    if (index < 0)
      return this.forceLogin(req, res)
    console.log("load main from loadLogin")
    res.render('main', {
        userName: users[index].getUserName(),
        isAdminUser: users[index].isAdminUser,
        extensions: users[index].extensionList,
    })
  },
  loadSettingsPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadSettingsPage(res)
  },
  loadCallLogsPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadCallLogsPage(res)
  },
  loadReportingsPage: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].loadReportingsPage(res)
  },
  resetAccountSubscription: function(req, res){
    var index = getUserIndex(req.session.userId)
    console.log("index " + index)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].resetAccountSubscription(req, res)
  },
  getAccountExtensions: function(req, res){
    var index = getUserIndex(req.session.userId)
    console.log("index " + index)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].getAccountExtensions(res)
  },
  readExtensions: function(req, res){
    var index = getUserIndex(req.session.userId)
    console.log("index " + index)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readExtensions(res)
  },
  addExtensions: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].addExtensions(req, res)
  },
  removeExtension: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].removeExtension(req, res)
  },
  adminAddExtensions: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].adminAddExtensions(req, res)
  },
  adminRemoveExtensions: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].adminRemoveExtensions(req, res)
  },
  pollActiveCalls: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].pollActiveCalls(res)
  },
  readCallLogs: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readCallLogs(req, res)
  },
  readReports: function(req, res){
    var index = getUserIndex(req.session.userId)
    if (index < 0)
      return this.forceLogin(req, res)
    users[index].readReports(req, res)
  },
  processNotification: function(bodyObj){
    var index = getUserIndexByExtensionId(bodyObj.ownerId)
    if (index < 0)
      return
    users[index].processNotification(bodyObj)
  }
}
