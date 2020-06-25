const pgdb = require('./db')

const RCPlatform = require('./platform.js')
var router = require('./router');
const Account = require('./event-engine.js')

require('dotenv').load()
var fakeExtId = ["12345678", "23144665", "33144665"]

function User(id, index){
  //just for test
  this.index = index
  this.id = id
  this.extensionList = []
  this.subscriptionId = ""
  this.eventFilters = []
  this.monitoredExtensionList = []
  this.updateData = false
  this.localTimeOffset = (3600 * 7 * 1000)
  this.accountId = 0
  this.extensionId = 0
  this.userName = ""
  this.isAdminUser = false
  this.eventEngine = undefined
  this.platform_engine = new RCPlatform(this)
}

var engine = User.prototype = {
  setExtensionId: function(id) {
      this.extensionId = id
    },
    setUserName: function (userName){
      this.userName = userName
    },
    getUserId: function(){
      return this.id
    },
    getExtensionId: function(){
      return this.extensionId
    },
    getUserName: function(){
      return this.userName;
    },
    getPlatform: function(){
      return this.platform_engine.getPlatform()
    },
    login: async function(req, res, callback){
      if (req.query.code) {
        var extensionId = await this.platform_engine.login(req.query.code)
        if (extensionId){
            // fake id for testing different user agent
            //if (this.index < 1)
            //  extensionId = fakeExtId[this.index]
            console.log("extensionId: " + extensionId)
            this.setExtensionId(extensionId)
            req.session.extensionId = extensionId;
            callback(null, extensionId)
            var p = this.platform_engine.getPlatform()
            if (p){
              try {
                var resp = await p.get("/restapi/v1.0/account/~/extension/~/")
                var respObj = await resp.json()
                //if (respObj.permissions.admin.enabled){
                if (extensionId == process.env.ADMIN_EXT_ID || respObj.permissions.admin.enabled) { // Phong Vu fake admin
                    this.isAdminUser = true
                    console.log("Role: " + respObj.permissions.admin.enabled)
                }
                var fullName = respObj.contact.firstName + " " + respObj.contact.lastName
                this.setUserName(fullName)

                var resp = await p.get("/restapi/v1.0/account/~/")
                var respObj = await resp.json()

                this.accountId = respObj.id
                this.eventEngine = router.activeAccounts.find(o => o.accountId == respObj.id)
                var thisClass = this
                thisClass.createAccountExtensionsTable((err, result) =>{
                  console.log("DONE createAccountExtensionsTable")
                  thisClass.createAccountMonitoredExtensionsTable((err, result) =>{
                    console.log("DONE createAccountMonitoredExtensionsTable")
                    thisClass.createCallLogsAnalyticsTable((err, result) =>{
                      console.log("DONE createCallLogsAnalyticsTable")
                      thisClass.createUserMonitoredExtensionsTable((err, result) =>{
                        console.log("DONE createUserMonitoredExtensionsTable")
                        thisClass.readUserMonitoredExtensionsTable((err, result) => {
                          console.log("DONE readUserMonitoredExtensionsTable")
                          console.log("call setup")
                          thisClass.setup()
                          res.send('login success');
                        })
                        /*
                          if (thisClass.eventEngine){
                            // read
                            // copy account monitor list from engine
                            Object.assign(thisClass.monitoredExtensionList, thisClass.eventEngine.monitoredExtensionList);
                            res.send('login success');
                          }
                          ///
                          thisClass.readAccountMonitoredExtensionsTable(async(err, result) => {
                            if (!err){
                              await thisClass.setup()
                              res.send('login success');
                            }
                          })
                          //
                        })
                        */
                      })
                    })
                  })
                })
              } catch (e) {
                console.error(e);
                res.send('login success');
              }
            }else{
              console.log('login failed')
              res.send('login failed');
            }
          }else {
            callback("error", this.extensionId)
          }
      } else {
        res.send('No Auth code');
        callback("error", null)
      }
    },
    loadSettingsPage: function(res){
      console.log("loadSettingsPage")
      res.render('settings',{
        userName: this.userName,
        data: this.extensionList
      })
    },
    logout: async function(req, res, callback){
      console.log("LOGOUT FUNC")
      //var p = this.getPlatform()
      await this.platform_engine.logout()
      callback(null, "logged out")
    },
    resetAccountSubscription: async function(req, res){
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          let response = await p.get('/restapi/v1.0/subscription')
          let json = await response.json();
          if (json.records.length > 0){
            for (var record of json.records) {
              if (record.deliveryMode.transportType == "WebHook"){
                if (this.subscriptionId == record.id){
                  await p.delete('/restapi/v1.0/subscription/' + record.id)
                  console.log("Deleted " + this.subscriptionId)
                }else
                  console.log("sub id " + record.id)
              }
            }
          }
          this.subscriptionId = ""
          this.eventFilters = []
          for (var ext of this.eventEngine.monitoredExtensionList){
            this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
          }
          if (req.query.delete == 'false'){
            await this.subscribeForNotification()
          }else{
            updateCustomersTable(this.accountId, this.subscriptionId)
          }
          console.log("after sub")
          res.send({status:"ok"})
        }catch (e){
          console.error(e);
          res.send({status:"failed"})
        }
      }else{
        res.send({status:"failed"})
      }
    },
    readAccountExtensionsFromTable: function(callback){
      console.log("readAccountExtensionsFromTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = "SELECT * FROM " + tableName
      var thisClass = this
      this.extensionList = []

      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          callback (err, "")
        }
        if (result.rows){
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name
            }
            thisClass.extensionList.push(extension)
          }
          callback (null, "Done readAccountExtensionsFromTable")
        }
      });
    },
    setup: function(){
      if (this.eventEngine == undefined){
        console.log("this account is not found from engine")
        //updateAccountExtensionsTable(this.accountId, this.extensionList)
        console.log("account info: " + this.accountId + " / " + this.subscriptionId)
        this.eventEngine = new Account(this.accountId, this.subscriptionId)
        this.eventEngine.setup((err, result) => {
          router.activeAccounts.push(this.eventEngine)// maybe no need
          console.log("FROM User class activeAccounts.length: " + router.activeAccounts.length)
          for (var ext of this.eventEngine.monitoredExtensionList){
            this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
          }
          Object.assign(this.extensionList, this.eventEngine.monitoredExtensionList);
          if (this.eventFilters.length){
            this.subscribeForNotification()
          }
        })
      }else{
        //console.log(this.eventEngine)
        console.log("Handled in autoStart()")
        //console.log(JSON.stringify(this.eventEngine.monitoredExtensionList))
        //this.monitoredExtensionList = this.eventEngine.monitoredExtensionList
        this.subscriptionId = this.eventEngine.subscriptionId
        for (var ext of this.eventEngine.monitoredExtensionList){
          this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
        }
        this.extensionList = []
        for (var ext of this.eventEngine.monitoredExtensionList){
            if (this.monitoredExtensionList.find(o => o.id === ext.id) == undefined){
              var item = {
                id: ext.id,
                name: ext.name
              }
              this.extensionList.push(item)
            }
        }
        //console.log(JSON.stringify(this.eventEngine.monitoredExtensionList))
        console.log("=========")
        //console.log(JSON.stringify(this.monitoredExtensionList))
      }
    },
    /*
    setup: async function(){
      if (this.extensionList.length == 0){
        var nav = await this.readExtensionFromServer("")
      }
      if (this.eventEngine == undefined){
        console.log("this account is not found from engine")
        var tableName = "rt_analytics_" + this.accountId
        var query = "SELECT * FROM " + tableName
        var thisClass = this
        this.monitoredExtensionList = []
        this.eventFilters = []
        pgdb.read(query, (err, result) => {
          if (err){
            console.error(err.message);
            return
          }
          if (result.rows){
            result.rows.sort(sortByAddedDate)
            for (var ext of result.rows){
              var extension = {
                id: ext.extension_id,
                name: ext.name,
                callStatistics: {
                  totalCallDuration: ext.total_call_duration,
                  totalCallRespondDuration: ext.total_call_respond_duration,
                  inboundCalls: ext.inbound_calls,
                  outboundCalls: ext.outbound_calls,
                  missedCalls: ext.missed_calls,
                  voicemails: ext.voicemails
                },
                activeCalls: []
              }
              thisClass.monitoredExtensionList.push(extension)
              //updateAnalyticsDb(thisClass.accountId, extension)
              thisClass.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.extension_id}/telephony/sessions`)
            }
          }

          if (thisClass.eventFilters.length){
            thisClass.subscribeForNotification()
          }
          updateAccountExtensionsTable(thisClass.accountId, thisClass.extensionList)
          // care engine and add to router.activeAccounts
          console.log("account info: " + thisClass.accountId + " / " + thisClass.subscriptionId)
          thisClass.eventEngine = new Account(thisClass.accountId, thisClass.subscriptionId)
          thisClass.this.eventEngine.setup()
          router.activeAccounts.push(thisClass.eventEngine)
          console.log("FROM User class activeAccounts.length: " + router.activeAccounts.length)
        });
      }else{
        console.log("Handle in autoStart()")
        //console.log(JSON.stringify(this.eventEngine.monitoredExtensionList))
        this.monitoredExtensionList = this.eventEngine.monitoredExtensionList
        this.subscriptionId = this.eventEngine.subscriptionId
        for (var ext of this.monitoredExtensionList)
          this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
      }
    },
    */
    readExtensions: function(res){
      console.log("read extensions now")
      this.extensionList = []
      for (var ext of this.eventEngine.monitoredExtensionList){
          if (this.monitoredExtensionList.find(o => o.id === ext.id) == undefined){
            var item = {
              id: ext.id,
              name: ext.name
            }
            this.extensionList.push(item)
          }
      }
      var response = {
            status: "ok",
            extensions: this.extensionList,
            data: this.monitoredExtensionList
          }
      res.send(response)
      /*
      var thisClass = this
      this.readAccountMonitoredExtensionsTable((err, result) => {
        if (thisClass.eventEngine){
          console.log("this extension can use this engine")
          var tableName = "rt_monitored_" + this.extensionId
          var query = "SELECT * FROM " + tableName
          thisClass.monitoredExtensionList = []
          pgdb.read(query, (err, result) => {
            if (err){
              console.error(err.message);
            }else{
              if (result.rows){
                result.rows.sort(sortByAddedDate)
                // copy monitored ext from main account.
                for (var item of result.rows){
                  for (var ext of thisClass.eventEngine.monitoredExtensionList){
                    if (item.extension_id == ext.id){
                      var c = Object()
                      clone = Object.assign(c, ext)
                      thisClass.monitoredExtensionList.push(clone)
                      break
                    }
                  }
                }
              }
            }
            var response = {
                  status: "ok",
                  extensions: thisClass.extensionList,
                  data: thisClass.monitoredExtensionList
                }
            res.send(response)
          });
        }
      })
      */
      //}
    },
    readUserMonitoredExtensionsTable: function(callback){
      var tableName = "rt_monitored_" + this.extensionId
      var query = "SELECT * FROM " + tableName
      var thisClass = this
      this.monitoredExtensionList = []
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          callback(err.message, "")
        }else{
          if (result.rows){
            result.rows.sort(sortByAddedDate)
            // copy monitored ext from main account.
            for (var item of result.rows){
              for (var ext of thisClass.eventEngine.monitoredExtensionList){
                if (item.extension_id == ext.id){
                  var clone = Object()
                  Object.assign(clone, ext)
                  thisClass.monitoredExtensionList.push(clone)
                  break
                }
              }
            }
          }
          callback(null, "Done")
        }
      });
    },
    readAccountMonitoredExtensionsTable: function(callback){
      console.log("this extension can use this account/engine")
      var tableName = "rt_analytics_" + this.accountId
      var query = "SELECT * FROM " + tableName
      var thisClass = this
      this.extensionList = []
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          return
        }
        if (result.rows){
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name
            }
            thisClass.extensionList.push(extension)
          }
        }
        callback(null, "done")
      });
    },
    getAccountExtensions: async function(res){
      var thisClass = this
      this.readAccountExtensionsFromTable((err, result) => {
        if (!err){
          if (result.length){
            var response = {
                status: "ok",
                extensions: result,
                monitoredExtensions: thisClass.eventEngine.monitoredExtensionList
            }
            res.send(response)
            console.log("load settings")
          }else{
            this.readExtensionFromServer(res, "", [])
          }
        }
      })
      /*
      console.log("extensionList length: " + this.eventEngine.extensionList.length)
      if (this.eventEngine.extensionList.length == 0){
        var nav = await this.readExtensionFromServer("", res)
      }else{
        var response = {
            status: "ok",
            extensions: this.eventEngine.extensionList,
            monitoredExtensions: this.eventEngine.monitoredExtensionList
        }
        res.send(response)
      }
      */

    },
    // only admin can read this
    readAccountExtensionsFromTable: function(callback){
      console.log("readAccountExtensionsFromTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = "SELECT * FROM " + tableName
      var extensionList = []
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          callback (err, null)
        }
        if (result.rows){
          for (var ext of result.rows){
            var extension = {
              id: ext.extension_id,
              name: ext.name
            }
            extensionList.push(extension)
          }
          console.log(extensionList.length)
          callback (null, extensionList)
        }
      });
    },
    readExtensionFromServer: async function(res, uri, extensionList){
      var endpoint = "/restapi/v1.0/account/~/extension"
      var params = {
        status: ["Enabled"],
        type: ["User"],
        perPage: 1000
      }
      if (uri != ""){
        endpoint = uri
        params = {}
      }
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          var resp = await p.get(endpoint, params)
          var jsonObj = await resp.json()
          for (var record of jsonObj.records){
            var item = {
              name: record.name.trim(),
              id: record.id,
              numbers: record.extensionNumbers
            }
            //this.eventEngine.extensionList.push(item)
            extensionList.push(item)
          }
          if (jsonObj.navigation.hasOwnProperty("nextPage") && jsonObj.navigation.nextPage.uri)
            await this.readExtensionFromServer(res, jsonObj.navigation.nextPage.uri, extensionList)
          else{
            this.updateAccountExtensionsTable(extensionList)
            var response = {
                status: "ok",
                extensions: extensionList,
                monitoredExtensions: this.eventEngine.monitoredExtensionList
            }
            res.send(response)
          }
        } catch (e) {
          console.error(e);
        }
      }else{
        console.log('login failed')
      }
    },
    loadCallLogsPage: function (res) {
      res.render('calllogs', {
        userName: this.userName,
        data: this.monitoredExtensionList
      })
    },
    loadReportingsPage: function (res) {
      res.render('reportings', {
        userName: this.userName,
        data: this.monitoredExtensionList
      })
    },
    adminRemoveExtensions: async function(req, res){
      var status = "ok"
      if (this.isAdminUser){
        var extensions = JSON.parse(req.body.extensions)
        for (var extId of extensions){
          this.eventEngine.monitoredExtensionList.splice(this.eventEngine.monitoredExtensionList.findIndex(o => o.id === extId), 1)
          var i = this.eventFilters.indexOf(extId)
          if (i >= 0)
            this.eventFilters.splice(i, 1)
        }
        await this.subscribeForNotification()
        removeExtensionFromAccountAnalyticsTable(this.accountId, extensions)
      }else{
        status = "Not allowed"
      }
      response = {
        status: status,
        data: this.eventEngine.monitoredExtensionList
      }
      res.send(response)
    },
    adminAddExtensions: async function (req, res) {
      if (this.isAdminUser){
        var extensions = JSON.parse(req.body.extensions)
        var newExtensions = []

        for (var ext of extensions){
          if (!this.eventEngine.monitoredExtensionList.find(o => o.id == ext.id)){
            var monitoredExtension = {
              id: ext.id,
              name: ext.name,
              callStatistics: {
                totalCallDuration: 0,
                totalCallRespondDuration: 0,
                inboundCalls: 0,
                outboundCalls: 0,
                missedCalls: 0,
                voicemails: 0
              },
              activeCalls: []
            }
            newExtensions.push(monitoredExtension)
            this.eventEngine.monitoredExtensionList.push(monitoredExtension)
          }
        }
        this.eventFilters = []
        for (var ext of this.eventEngine.monitoredExtensionList){
          this.eventFilters.push(`/restapi/v1.0/account/~/extension/${ext.id}/telephony/sessions`)
        }
        await this.subscribeForNotification()
        this.updateAccountMonitoredExtensionsTable(newExtensions)
        var response = {
          status: "ok",
          data: this.eventEngine.monitoredExtensionList
        }
        res.send(response)
      }else{
        var response = {
          status: "Not allowed",
          data: []
        }
        res.send(response)
      }
    },
    removeExtension: async function(req, res){
      var id = req.query.id
      this.removeExtensionFromMonitoredTable(id)
      for (var i=0; i< this.monitoredExtensionList.length; i++){
        var extension = this.monitoredExtensionList[i]
        if (extension.id == id){
          this.monitoredExtensionList.splice(i, 1)
          break
        }
      }
      response = {
        status: "ok",
        data: this.monitoredExtensionList
      }
      res.send(response)
    },
    addExtensions: async function (req, res) {
      var extensionList = JSON.parse(req.body.extensions)
      var newList = []
      for (var extension of extensionList){
        var e = this.monitoredExtensionList.find(o => o.id === extension.id)
        if (e == undefined){
          var ext = this.eventEngine.monitoredExtensionList.find(o => o.id == extension.id)
          if (ext){
            // copy this user to monitoring list
            var e = Object()
            var e = Object.assign(e, ext)
            this.monitoredExtensionList.push(e)
            newList.push(ext)
          }
        }
      }
      this.updateUserMonitoredExtensionsTable(newList)
      var response = {
          status: "ok",
          data: newList
      }
      res.send(response)
    },
    /*
    addExtensions: async function (req, res) {
      if (this.isAdminUser){
        var extensionId = req.query.id
        var extensionName = req.query.name
        for (var item of this.eventFilters){
          if (item.indexOf(extensionId) > 0)
          return res.send({ status: "duplicated"})
        }
        this.eventFilters.push(`/restapi/v1.0/account/~/extension/${extensionId}/telephony/sessions`)
        await this.subscribeForNotification()
        var monitoredExtension = {
          id: extensionId,
          name: extensionName,
          callStatistics: {
            totalCallDuration: 0,
            totalCallRespondDuration: 0,
            inboundCalls: 0,
            outboundCalls: 0,
            missedCalls: 0,
            voicemails: 0
          },
          activeCalls: []
        }
        // add this user to monitoring list
        this.monitoredExtensionList.push(monitoredExtension)
        // add this user to db
        updateAnalyticsTable(this.accountId, monitoredExtension)
        var response = {
          status: "ok",
          data: monitoredExtension
        }
        res.send(response)
      }else{
        if (this.monitoredExtensionList.find(o => o.id === req.query.id))
          return res.send({ status: "duplicated"})
        var ext = this.eventEngine.monitoredExtensionList.find(o => o.id === req.query.id)

        if (ext){
          // add this user to monitoring list
          var e = Object()
          var e = Object.assign(e, ext)
          this.monitoredExtensionList.push(e)
          // add this user to db
          updateExtensionMonitoredTable(this.extensionId, req.query.id, req.query.name)
        }
        var response = {
          status: "ok",
          data: ext
        }
        res.send(response)
      }
    },
    */
    subscribeForNotification: async function(){
      //console.log(this.eventFilters)
      var p = this.platform_engine.getPlatform()
      if (p){
        try {
          if (this.subscriptionId == ""){
            let resp = await p.post('/restapi/v1.0/subscription',
                        {
                            eventFilters: this.eventFilters,
                            //eventFilters: ['/restapi/v1.0/account/~/telephony/sessions'],
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            console.log("Ready to receive telephonyStatus notification via WebHook.")
            this.subscriptionId = jsonObj.id
            this.eventEngine.subscriptionId = this.subscriptionId
            console.log("Create subscription")
            console.log(this.subscriptionId)
            updateCustomersTable(this.accountId, this.subscriptionId)
          }else{
            let resp = await p.put(`/restapi/v1.0/subscription/${this.subscriptionId}`,
                        {
                            eventFilters: this.eventFilters,
                            //eventFilters: ['/restapi/v1.0/account/~/telephony/sessions'],
                            deliveryMode: {
                                transportType: 'WebHook',
                                address: process.env.DELIVERY_MODE_ADDRESS
                            },
                            expiresIn: 31536000
                        })
            var jsonObj = await resp.json()
            this.subscriptionId = jsonObj.id
            this.eventEngine.subscriptionId = this.subscriptionId
            console.log("Update subscription")
            console.log(this.subscriptionId)
          }

          //updateCustomersTable(this.accountId, this.subscriptionId)
          // add a new engine
          if (this.eventEngine){
            console.log("Update eventEngine")
            this.eventEngine.subscriptionId = this.subscriptionId
          }else{
            console.log("create and add a new eventEngine")
            this.eventEngine = new Account(this.accountId, this.subscriptionId)
            this.eventEngine.setup()
            this.eventEngine.monitoredExtensionList = this.monitoredExtensionList
            router.activeAccounts.push(this.eventEngine)
          }
        }catch (e) {
          console.error(e);
        }
      }
    },
    pollActiveCalls: function(res){
      //console.log(this.extensionId)
      //if (!this.isAdminUser && this.eventEngine){
        for (var ext  of this.monitoredExtensionList){
          var activeExt = this.eventEngine.monitoredExtensionList.find( o => o.id === ext.id)
          if (activeExt){
            ext = Object.assign(ext, activeExt)
            var currentTimestamp = new Date().getTime()
            for (var n=0; n<ext.activeCalls.length; n++){
              var call = ext.activeCalls[n]
              call.localCurrentTimestamp = new Date().getTime()
              if (call.status == "CONNECTED" && call.localConnectingTimestamp > 0)
                call.talkDuration = Math.round((currentTimestamp - call.localConnectingTimestamp)/1000) - call.callHoldDuration
              else if (call.status == "RINGING" && call.localRingingTimestamp > 0)
                call.callRespondDuration = Math.round((currentTimestamp - call.localRingingTimestamp)/1000)
              else if (call.status == "HOLD" && call.localHoldingTimestamp > 0)
                call.callHoldDuration = Math.round((currentTimestamp - call.localHoldingTimestamp)/1000) + call.callHoldDurationTotal
            }
          }
        }
        var response = {
          status: "ok",
          //update: this.updateData,
          data: this.monitoredExtensionList
        }
        //console.log("POLLING DATA")
        //console.log(JSON.stringify(this.monitoredExtensionList[0].activeCalls))
        //console.log("==============")
        //this.updateData = false
        res.send(response)

        /*if (!this.updateData){
          for (var ext  of this.monitoredExtensionList){
            for (var n=0; n<ext.activeCalls.length; n++){
              var call = ext.activeCalls[n]
              if (call.status == "NO-CALL"){
                ext.activeCalls.splice(n, 1);
                console.log("remove active call from " + this.extensionId)
              }
            }
          }
        }*/
      //}else{
      //  this.eventEngine.pollActiveCalls(res)
      //}
    },
    readCallLogs: function(req, res){
      var tableName = "rt_call_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      if (req.body.direction != "*"){
        query += ` AND (direction ='${req.body.direction}')`
      }
      if (req.body.call_type != "*"){
        query += ` AND (call_type ='${req.body.call_type}')`
      }
      if (req.body.action != "*"){
        query += ` AND (call_action ='${req.body.action}')`
      }

      var logs = []
      var thisClass = this
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: logs
          }
          return res.send(response)
        }
        if (result.rows){
          result.rows.sort(sortCallTime)
          var options = { year: 'numeric', month: 'short', day: 'numeric' };
          for (var item of result.rows){
            var obj = thisClass.monitoredExtensionList.find(o => o.id === item.extension_id)
            var name = (obj) ? obj.name : "Unknown"

            //var ringTime = (item.ringing_timestamp > 0) ? new Date(item.ringing_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            //var connectTime = (item.connecting_timestamp> 0) ? new Date(item.connecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0] : "-"
            var call = {
              id: item.extension_id,
              name: name,
              sessionId: item.session_id,
              customerNumber: item.customer_number,
              agentNumber: item.agent_number,
              direction: item.direction,
              //startDate: "", //new Date(item.calling_timestamp - thisClass.localTimeOffset).toLocaleDateString("en-US", options),
              callTimestamp: item.calling_timestamp, //new Date(item.calling_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0],  // DOUBLE DEFAULT 0'
              callDuration: item.call_duration,
              ringTimestamp: item.ringing_timestamp, //ringTime,
              connectTimestamp: item.connecting_timestamp, //connectTime,
              disconnectTimestamp: item.disconnecting_timestamp, //new Date(item.disconnecting_timestamp - thisClass.localTimeOffset).toISOString().match(/(\d{2}:){2}\d{2}/)[0], // DOUBLE DEFAULT 0'
              holdTimestamp: item.holding_timestamp,
              callHoldDuration: item.call_hold_duration,
              holdingCount: item.holding_count,
              callRespondDuration: item.call_respond_duration,
              callType: item.call_type,
              callAction: item.call_action,
              callResult: item.call_result
            }
            logs.push(call)
          }
        }

        var response = {
            status: "ok",
            data: logs
          }
        res.send(response)
      });
    },
    readReports: function(req, res){
      var tableName = "rt_call_logs_" + this.accountId
      var query = `SELECT * FROM ${tableName}`
      query += ` WHERE (calling_timestamp BETWEEN ${req.body.from} AND ${req.body.to})`
      if (req.body.extensions != ""){
        query += ` AND (extension_id IN ${req.body.extensions})`
      }
      var inboundActiveCalls = 0
      var outboundActiveCalls = 0
      for (var ext of this.monitoredExtensionList){
        if (ext.activeCalls.length){
          if (ext.activeCalls[0].status != "NO-CALL"){
            if (ext.activeCalls[0].direction == "Inbound")
              inboundActiveCalls++
            else
              outboundActiveCalls++
          }
        }
      }
      var reports = {
        inboundActiveCalls: inboundActiveCalls,
        outboundActiveCalls: outboundActiveCalls,
        inbound: 0,
        outbound: 0,
        connected: 0,
        cancelled: 0,
        voicemail: 0,
        missed: 0,
        parked: 0,
        directCall: 0,
        ringoutCall: 0,
        zoomCall: 0,
        inboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        outboundCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        missedCallTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        voicemailTime: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
        totalInboundCallDuration: 0,
        totalInboundTalkDuration: 0,
        totalInboundHoldDuration: 0,
        totalInboundRespondDuration: 0,
        totalOutboundCallDuration: 0,
        totalOutboundTalkDuration: 0,
        totalOutboundHoldDuration: 0,
        longestCallDuration: 0,
        longestTalkDuration: 0,
        longestRespondDuration: 0,
        longestHoldDuration: 0,
        averageRespondDuration: 0,
        averageHoldDuration: 0
      }
      var thisClass = this
      pgdb.read(query, (err, result) => {
        if (err){
          console.error(err.message);
          var response = {
            status: "ok",
            data: {}
          }
          return res.send(response)
        }
        if (result.rows){
          //result.sort(sortCallTime)
          var timeOffset = req.body.time_offset
          for (var item of result.rows){
            var d = new Date(item.calling_timestamp - timeOffset)
            var hour = parseInt(d.toISOString().substring(11, 13))
            if (item.direction == "Inbound"){
              reports.inbound++
              reports.inboundCallTime[hour]++
              if (item.connecting_timestamp > item.ringing_timestamp){
                var tempTime = (item.connecting_timestamp - item.ringing_timestamp) / 1000
                if (tempTime < 120){ // cannot be longer than 2 mins???
                  reports.averageRespondTime += tempTime
                  if (tempTime > reports.longestRespondDuration)
                    reports.longestRespondDuration = tempTime
                }
              }else{
                //console.log(item.connecting_timestamp + " == " + item.ringing_timestamp)
              }
              reports.totalInboundCallDuration += parseInt(item.call_duration)
              reports.totalInboundHoldDuration += parseInt(item.call_hold_duration)
              reports.totalInboundRespondDuration += parseInt(item.call_respond_duration)
            }else {
              reports.outbound++
              reports.outboundCallTime[hour]++
              reports.totalOutboundCallDuration += parseInt(item.call_duration)
              reports.totalOutboundHoldDuration += parseInt(item.call_hold_duration)
            }
            if (item.call_action == "Connected")
              reports.connected++
            else if (item.call_action == "Cancelled")
              reports.cancelled++
            else if (item.call_action == "Voicemail"){
              reports.voicemail++
              reports.voicemailTime[hour]++
            }else if (item.call_action == "Missed Call"){
              reports.missed++
              reports.missedCallTime[hour]++
            }else if (item.call_action == "Parked"){
              reports.parked++
            }
            if (item.call_type == "Call")
              reports.directCall++
            else if (item.call_type == "RingOut")
              reports.ringoutCall++
            else if (item.call_type == "Zoom")
              reports.zoomCall++

            if (item.call_duration > reports.longestCallDuration)
              reports.longestCallDuration = item.call_duration

            if (item.connecting_timestamp > 0){
              console.log("Time " + new Date(parseInt(item.disconnecting_timestamp)).toISOString())
              var tempTime = parseInt(item.disconnecting_timestamp) - parseInt(item.connecting_timestamp)
              console.log("difference " + tempTime)
              tempTime = Math.round(tempTime/1000) - parseInt(item.call_hold_duration)
              console.log("duration: " + tempTime)
              if (tempTime > reports.longestTalkDuration)
                reports.longestTalkDuration = tempTime
            }

            if (item.call_hold_duration > reports.longestHoldDuration)
              reports.longestHoldDuration = item.call_hold_duration

            //reports.averageHoldTime: 0
          }
        }
        //console.log(reports.averageRespondTime)
        reports.totalInboundTalkDuration = (reports.totalInboundCallDuration - reports.totalInboundHoldDuration)
        reports.averageRespondDuration /= reports.inbound
        //console.log(reports)
        var response = {
            status: "ok",
            data: reports
          }
        res.send(response)
      });
    },
    createUserMonitoredExtensionsTable: function(callback) {
      console.log("createUserMonitoredExtensionsTable")
      var tableName = "rt_monitored_" + this.extensionId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64))'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    createCallLogsAnalyticsTable: function(callback) {
      console.log("createCallLogsAnalyticsTable")
      var tableName = "rt_call_logs_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' ('
      query += 'session_id VARCHAR(12) PRIMARY KEY'
      query += ', extension_id VARCHAR(15)'
      query += ', customer_number VARCHAR(15)'
      query += ', agent_number VARCHAR(15)'
      query += ', direction VARCHAR(12)',
      query += ', calling_timestamp BIGINT DEFAULT 0'
      query += ', call_duration BIGINT DEFAULT 0'
      query += ', ringing_timestamp BIGINT DEFAULT 0'
      query += ', connecting_timestamp BIGINT DEFAULT 0'
      query += ', disconnecting_timestamp BIGINT DEFAULT 0'
      query += ', holding_timestamp BIGINT DEFAULT 0'
      query += ', call_hold_duration INT DEFAULT 0'
      query += ', holding_count INT DEFAULT 0'
      query += ', call_respond_duration INT DEFAULT 0'
      query += ', call_type VARCHAR(32)',
      query += ', call_action VARCHAR(15)',
      query += ', call_result VARCHAR(128)',
      query += ')'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    createAccountMonitoredExtensionsTable: function(callback) {
      console.log("createAccountMonitoredExtensionsTable")
      var tableName = "rt_analytics_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64), total_call_duration BIGINT DEFAULT 0, total_call_respond_duration BIGINT DEFAULT 0, inbound_calls INT DEFAULT 0, outbound_calls INT DEFAULT 0, missed_calls INT DEFAULT 0, voicemails INT DEFAULT 0)'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    createAccountExtensionsTable: function(callback) {
      console.log("createAccountExtensionsTable")
      var tableName = "rt_extensions_" + this.accountId
      var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, name VARCHAR(64))'
      pgdb.create_table(query, (err, res) => {
          if (err) {
            console.log(err, res)
            callback(err, err.message)
          }else{
            console.log("DONE")
            callback(null, "Ok")
          }
        })
    },
    updateAccountMonitoredExtensionsTable: function(extensionList){
      var tableName = "rt_analytics_" + this.accountId
      var query = "INSERT INTO " + tableName + " (extension_id, added_timestamp, name, total_call_duration, total_call_respond_duration, inbound_calls, outbound_calls, missed_calls, voicemails) VALUES "
      var lastIndex = extensionList.length - 1
      for (var i=0; i<extensionList.length; i++){
        var ext = extensionList[i]
        var name = ext.name.replace(/'/g,"''")
        var t = new Date().getTime()
        if (i < lastIndex)
          query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0, 0, 0),`
        else
          query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0, 0, 0)`
      }
      query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
      pgdb.insert(query, [], (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateAccountMonitoredExtensionsTable DONE");
        }
      })
    },
    updateUserMonitoredExtensionsTable: function(extensionList){
      var tableName = "rt_monitored_" + this.extensionId
      var query = "INSERT INTO " + tableName + " (extension_id, added_timestamp, name) VALUES "
      var lastIndex = extensionList.length - 1
      for (var i=0; i<extensionList.length; i++){
        var ext = extensionList[i]
        var name = ext.name.replace(/'/g,"''")
        var date = new Date().getTime()
        if (i < lastIndex)
          query += `('${ext.id}',${date},'${name}'),`
        else
          query += `('${ext.id}',${date},'${name}')`
      }
      query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
      pgdb.insert(query, [], (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateUserMonitoredExtensionsTable DONE");
        }
      })
    },
    removeExtensionFromMonitoredTable: function(monExtId){
      var tableName = "rt_monitored_" + this.extensionId
      var query = 'DELETE FROM ' + tableName
      query += " WHERE extension_id='" + monExtId + "'"

      pgdb.remove(query, (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("removeExtensionFromMonitoredTable DONE");
        }
      })
    },
    updateAccountExtensionsTable: function(extensionList){
      var tableName = "rt_extensions_" + this.accountId
      var query = "INSERT INTO " + tableName + "(extension_id, name) VALUES "
      var lastIndex = extensionList.length - 1
      for (var i=0; i<extensionList.length; i++){
      //for (var i=0; i<4; i++){
        var ext = extensionList[i]
        var name = ext.name.replace(/'/g,"''")
        if (i < lastIndex)
          query += `('${ext.id}','${name}'),`
        else
          query += `('${ext.id}','${name}')`
      }

      query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"

      pgdb.insert(query, [], (err, result) =>  {
        if (err){
          console.error(err.message);
          console.log("QUERY: " + query)
        }else{
          console.log("updateAccountExtensionsTable DONE");
        }
      })
    },
    checkSubscription: async function(){
      readAllRegisteredWebHookSubscriptions()
    }
};

module.exports = User;

function sortCallTime(a, b){
  return b.calling_timestamp - a.calling_timestamp
}

function formatDurationTime(dur){
  dur = Math.floor(dur)
  if (dur > 86400) {
    var d = Math.floor(dur / 86400)
    dur = dur % 86400
    var h = Math.floor(dur / 3600)
    //h = (h>9) ? h : "0" + h
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return d + "d " + h + ":" + m + ":" + s
  }else if (dur >= 3600){
    var h = Math.floor(dur / 3600)
    dur = dur % 3600
    var m = Math.floor(dur / 60)
    m = (m>9) ? m : ("0" + m)
    dur = dur % 60
    var s = (dur>9) ? dur : ("0" + dur)
    return h + ":" + m + ":" + s
  }else if (dur >= 60){
    var m = Math.floor(dur / 60)
    dur %= 60
    var s = (dur>9) ? dur : ("0" + dur)
    return m + ":" + s
  }else{
    //var s = (dur>9) ? dur : ("0" + dur)
    return dur + " secs"
  }
}

async function startWebhookSubscription(extensionId) {
    var eventFilters = ['/restapi/v1.0/account/~/extension/' + extensionId+ '/telephony/sessions']
    var res = await  rcsdk.post('/restapi/v1.0/subscription',
              {
                  eventFilters: eventFilters,
                  deliveryMode: {
                      transportType: 'WebHook',
                      address: process.env.DELIVERY_MODE_ADDRESS
                  }
              })
    var jsonObj = await res.json()
    console.log("Ready to receive telephonyStatus notification via WebHook.")
    g_subscriptionId = jsonObj.id
    storeSubscriptionId(jsonObj.id)
}

/// Clean up WebHook subscriptions
async function deleteRegisteredWebHookSubscription(id) {
  let response = await rcsdk.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      if (record.deliveryMode.transportType == "WebHook"){
        if (id == record.id){
          await rcsdk.delete('/restapi/v1.0/subscription/' + record.id)
          return console.log("Deleted " + id)
        }
      }
    }
  }
  console.log("no active subscription")
}

async function deleteAllRegisteredWebHookSubscriptions(p) {
  let response = await p.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      //if (record.deliveryMode.transportType == "WebHook"){
          await p.delete('/restapi/v1.0/subscription/' + record.id)
          console.log("Deleted")
      //}
    }
    console.log("Deleted all")
  }else{
    console.log("No subscription to delete")
  }
}

async function readAllRegisteredWebHookSubscriptions(p) {
  let response = await p.get('/restapi/v1.0/subscription')
  let json = await response.json();
  if (json.records.length > 0){
    for (var record of json.records) {
      if (record.deliveryMode.transportType == "WebHook"){
          console.log('subId: ' + record.id)
      }
    }
    if (json.records.length)
      deleteAllRegisteredWebHookSubscriptions(p)
  }else{
    console.log("No subscription to read")
  }
}

/*
function readAnalyticsDb(extensionId, callback){
  var tableName = "rt_analytics_" + accountId
  var query = "SELECT * FROM " + tableName + " WHERE extension_id='" + extensionId + "'"
  pgdb.read(query, (err, result) => {
    if (err){
      console.error(err.message);
      callback("err", null)
    }
    var allRows = result.rows
    if (result.rows){
      var item = result.row[0]
      var extension = {
        id: item.extension_id,
        name: item.name,
        callStatistics: {
          totalCallDuration: parseInt(item.total_call_duration),
          totalCallRespondDuration: parseInt(item.total_call_respond_duration),
          inboundCalls: parseInt(item.inbound_calls),
          outboundCalls: parseInt(item.outbound_calls),
          missedCalls: parseInt(item.missed_calls),
          voicemails: parseInt(item.voicemails)
        },
        activeCalls: []
      }
      callback("err", extension)
    }else
      callback("err", null)
  })
}
*/
/*
function updateAnalyticsTable(accountId, extensionList){
  var tableName = "rt_analytics_" + accountId
  var query = "INSERT INTO " + tableName + "(extension_id, added_timestamp, name, total_call_duration, total_call_respond_duration, inbound_calls, outbound_calls, missed_calls, voicemails) VALUES "
  var lastIndex = extensionList.length - 1
  for (var i=0; i<extensionList.length; i++){
    var ext = extensionList[i]
    var name = ext.name.replace(/'/g,"''")
    var t = new Date().getTime()
    if (i < lastIndex)
      query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0, 0, 0),`
    else
      query += `('${ext.id}',${t},'${name}', 0, 0, 0, 0, 0, 0)`
  }
  query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateAnalyticsTable DONE");
    }
  })
}
*/
function removeExtensionFromAccountAnalyticsTable(accountId, idList){
  var extensions = ""
  for (var id of idList)
    extensions += "'"+id+"'"
  var tableName = "rt_analytics_" + accountId
  var query = 'DELETE FROM ' + tableName
  query += " WHERE extension_id IN (" + extensions + ")"

  pgdb.remove(query, (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("removeExtensionFromAccountAnalyticsTable DONE");
    }
  })
}
/*
function createAccountExtensionsTable(accountId, callback) {
  console.log("createAccountExtensionsTable")
  var tableName = "rt_extensions_" + accountId
  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, name VARCHAR(64))'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
}

function createAccountAnalyticsTable(accountId, callback) {
  console.log("createAccountAnalyticsTable")
  var tableName = "rt_analytics_" + accountId
  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64), total_call_duration BIGINT DEFAULT 0, total_call_respond_duration BIGINT DEFAULT 0, inbound_calls INT DEFAULT 0, outbound_calls INT DEFAULT 0, missed_calls INT DEFAULT 0, voicemails INT DEFAULT 0)'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
}
// for users to creat own dashboard
function createUserMonitoredExtensionTable(extensionId, callback) {
  console.log("createUserMonitoredExtensionTable")
  var tableName = "rt_monitored_" + extensionId
  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (extension_id VARCHAR(15) PRIMARY KEY, added_timestamp BIGINT NOT NULL, name VARCHAR(64))'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
}
*/
/*
function updateExtensionMonitoredTable(extensionId, extensionList){
  var tableName = "rt_monitored_" + extensionId
  var query = "INSERT INTO " + tableName + " (extension_id, added_timestamp, name) VALUES "
  var lastIndex = extensionList.length - 1
  for (var i=0; i<extensionList.length; i++){
    var ext = extensionList[i]
    var name = ext.name.replace(/'/g,"''")
    var date = new Date().getTime()
    if (i < lastIndex)
      query += `('${ext.id}',${date},'${name}'),`
    else
      query += `('${ext.id}',${date},'${name}')`
  }
  query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"
  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateExtensionMonitoredTable DONE");
    }
  })
}
*/
/*
function removeExtensionFromMonitoredTable(extensionId, monExtId){
  var tableName = "rt_monitored_" + extensionId
  var query = 'DELETE FROM ' + tableName
  query += " WHERE extension_id='" + monExtId + "'"

  pgdb.remove(query, (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("removeExtensionFromMonitoredTable DONE");
    }
  })
}
*/
/*
function createCallLogsAnalyticsTable(accountId, callback) {
  console.log("createCallLogsAnalyticsTable")
  var tableName = "rt_call_logs_" + accountId

  var query = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' ('
  query += 'session_id VARCHAR(12) PRIMARY KEY'
  query += ', extension_id VARCHAR(15)'
  query += ', customer_number VARCHAR(15)'
  query += ', agent_number VARCHAR(15)'
  query += ', direction VARCHAR(12)',
  query += ', calling_timestamp BIGINT DEFAULT 0'
  query += ', call_duration BIGINT DEFAULT 0'
  query += ', ringing_timestamp BIGINT DEFAULT 0'
  query += ', connecting_timestamp BIGINT DEFAULT 0'
  query += ', disconnecting_timestamp BIGINT DEFAULT 0'
  query += ', holding_timestamp BIGINT DEFAULT 0'
  query += ', call_hold_duration INT DEFAULT 0'
  query += ', holding_count INT DEFAULT 0'
  query += ', call_respond_duration INT DEFAULT 0'
  query += ', call_type VARCHAR(32)',
  query += ', call_action VARCHAR(15)',
  query += ', call_result VARCHAR(128)',
  query += ')'
  pgdb.create_table(query, (err, res) => {
      if (err) {
        console.log(err, res)
        callback(err, err.message)
      }else{
        console.log("DONE")
        callback(null, "Ok")
      }
    })
}
*/
function updateAccountExtensionsTable(accountId, extensionList){
  var tableName = "rt_extensions_" + accountId
  var query = "INSERT INTO " + tableName + "(extension_id, name) VALUES "
  var lastIndex = extensionList.length - 1
  for (var i=0; i<extensionList.length; i++){
  //for (var i=0; i<4; i++){
    var ext = extensionList[i]
    var name = ext.name.replace(/'/g,"''")
    if (i < lastIndex)
      query += `('${ext.id}','${name}'),`
    else
      query += `('${ext.id}','${name}')`
  }

  query += " ON CONFLICT (extension_id) DO NOTHING" // UPDATE SET name='" + ext.name + "'"

  pgdb.insert(query, [], (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateAccountExtensionsTable DONE");
    }
  })
}

function updateCustomersTable(accountId, subscriptionId){
  var query = "INSERT INTO rt_call_analytics_customers (account_id, subscription_id)"
  query += " VALUES ($1,$2)"
  var values = [accountId, subscriptionId]
  query += " ON CONFLICT (account_id) DO UPDATE SET subscription_id='" + subscriptionId + "'"

  pgdb.insert(query, values, (err, result) =>  {
    if (err){
      console.error(err.message);
      console.log("QUERY: " + query)
    }else{
      console.log("updateCustomersTable DONE");
    }
  })
}

function sortByAddedDate(a, b){
  return b.added_timestamp - a.added_timestamp;
}
