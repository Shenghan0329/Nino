//jshint esversion:6
require('dotenv').config();
const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const app = express();
const findOrCreate = require("mongoose-findorcreate");
var GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require("mongoose");
const session = require('express-session');
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

const port = 8080;
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

app.use(session({
    secret:"Our secret",
    resave:false,
    saveUninitialized:false
}));

app.use(passport.initialize());
app.use(passport.session());

mongoose.set("strictQuery", false);
mongoose.connect(process.env.DATABASE,{useNewUrlParser:true});

app.set('view engine', 'ejs');

const userSchema = new mongoose.Schema({
    username: String,
    name: String,
    passWord: String,
    googleId: String,
    secret: String,
    hippo: String,
    diary:[{
        value: String,
        date: String
    }],
    ourdiary:[{
        name: String,
        value: String,
        date: String
    }]
});
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = mongoose.model("User",userSchema);

// use static authenticate method of model in LocalStrategy
passport.use(User.createStrategy());

// use static serialize and deserialize of model for passport session support
passport.serializeUser(function(user, done) {
    done(null, user);
  });
   
  passport.deserializeUser(function(user, done) {
    done(null, user);
  });

passport.use(new GoogleStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: process.env.URL+"/auth/google/secrets"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ googleId: profile.id }, function (err, user) {
        user.name = profile.name.givenName;
        return cb(err, user);
    });
  }
));

app.get("/",function(req,res){
    res.render("home");
});
app.get("/login",function(req,res){
    res.render("login");
});
app.get("/register",function(req,res){
    res.render("register");
});
app.get("/home",function(req,res){
    if(!req.isAuthenticated()){
        console.log("not found")
        res.redirect("./login");
    }else{
        User.find({"secret":{$ne: null}},function(err,users){
            if(err){
                console.log(err);
            }else{
                if(users){
                    res.render("main",{usersWithSecrets:users,name:req.session.passport.user.name});
                }else{
                    res.render("main",{userWithSecrets:[],name:req.session.passport.user.name});
                }
            }
        });
    }
    
});



app.get("/mydiary",function(req,res){
    if(!req.isAuthenticated()){
        console.log("not found")
        res.redirect("./login");
    }else{
        const id = req.session.passport.user._id;
        User.findOne({_id:id},function(err,user){
            if(err){
                console.log(err);
            }else{
                if(user){
                    const myDiary = user.diary;
                    res.render("mydiary",{diaries:myDiary,name:req.session.passport.user.name,user:"",myDiary:true});
                }else{
                    console.log("User not found");
                    res.render("mydiary",{diaries:[],name:req.session.passport.user.name,user:"",myDiary:true});
                }
            }
        });
    }
    
});

app.get("/ourdiary",function(req,res){
    if(!req.isAuthenticated()){
        console.log("not found")
        res.redirect("./login");
    }else{
        const id = req.session.passport.user._id;
        User.findOne({_id:id},function(err,user){
            if(err){
                console.log(err);
            }else{
                if(user){
                    if(!user.hippo){
                        res.redirect("./findmyhippo");
                    }else{
                        const hippo = user.hippo;
                        User.findOne({_id:hippo},function(err,hippo){
                            if(err){
                                console.log(err);
                            }else{
                                if(hippo.hippo!=user._id){
                                    res.redirect("./findmyhippo");
                                }else{
                                    const ourDiary = user.ourdiary;
                                    res.render("mydiary",{diaries:ourDiary,name:user.name,user:"Hippo found",myDiary:false});
                                }
                            }
                        })
                        
                    }
                }else{
                    console.log("User not found");
                    res.redirect("/home");
                }
            }
        });
    }  
});

app.get("/findmyhippo",function(req,res){
    if(!req.isAuthenticated()){
        console.log("not found")
        res.redirect("./login");
    }else{
        res.render("findMyHippo",{notFound:false,waiting:false});
    }

});

app.get("/logout",function(req,res){
    req.logout(function(err){});
    res.redirect("/");
});
app.get("/auth/google",
    passport.authenticate('google', { scope: ["profile"] })
);
app.get("/auth/google/secrets",passport.authenticate('google', { failureRedirect: '/login' }),
function(req, res) {
  // Successful authentication, redirect home.
  res.redirect('/home');
});
app.get("/submit",function(req,res){
    
    if(req.isAuthenticated()){
        const name=req.session.passport.user.name;
        res.render("submit",{name:name});
    }else{
        res.redirect("/login");
    }
});
app.get("/find",function(req,res){
    res.render("find",{send:"",loginButton:false,veriCode:false});
});

app.post("/register",function(req,res){
    const username = req.body.username;
    const name = req.body.name;
    User.register({username:username,name:name},req.body.password,function(err,user){
        if(err){
            console.log(err);
            res.redirect("/register");
        }else{
            passport.authenticate("local")(req,res,function(){
                res.redirect("/home");
            })
        }
    });
    
});

app.post("/login",function(req,res){
    const username = req.body.username;
    const password = req.body.password;
    const user = new User({
        username:username
    });

    req.login(user,function(err){
        if(err){
            console.log(err);
        }else{
            passport.authenticate("local",{ failureRedirect: '/login', failureMessage: true })(req,res,function(){
                User.findOne({username:username},function(err,user){
                    if(err){
                        console.log(err);
                    }else{
                        req.session.name = user.name;
                        req.session.email = user.username;
                    }
                });
                res.redirect("/home");
            })
        }
    });
})

app.post("/submit",function(req,res){
    const secret = req.body.secret;
    const userID = req.user._id;
    User.findById(userID,function(err,user){
        if(err){console.log(err);}
        else{
            if(user){
                user.secret = secret;
            user.save(function(){
                res.redirect("/home");
            });
            }
            
        }
    });
});

app.post("/mydiary",function(req,res){
    const diary = req.body.myNewDiary;
    const userID = req.user._id;
    const date = new Date().toString().slice(0,21);
    User.findById(userID,function(err,user){
        if(err){console.log(err);}
        else{
            if(user){
                const newDiary={date:date,value:diary};
                user.diary.push(newDiary);
                user.save(function(){
                    res.redirect("/mydiary");
                });
            }
            else{
                console.log("opps, something wrong with writing diary");
            }
        }
    });
});

app.post("/findmyhippo",function(req,res){
    const hippo = req.body.username;
    const userID = req.user._id;
    User.findById(userID,function(err,user){
        if(err){console.log(err);}
        else{
            if(user){
                console.log("userfound")
                User.findOne({username:hippo},function(err,hippo){
                    if(err){console.log(err);}
                    else{
                        if(hippo){
                            console.log("hippo found");
                            const hippoID=hippo._id;
                            user.hippo=hippoID;
                            user.save(function(){
                                if(hippo.hippo==userID){
                                    res.redirect("/ourdiary");

                                }else{
                                    res.render("findMyHippo",{notFound:false,waiting:true})
                                }
                                
                            });
                        }else{
                            res.render("findMyHippo",{notFound:true,waiting:false})
                        }
                    }
                })
            }
            else{
                console.log("opps, something wrong with finding you");
            }
        }
    });
});

app.post("/ourdiary",function(req,res){
    const date = new Date().toString().slice(0,21);
    const diary = req.body.myNewDiary;
    if(!req.isAuthenticated()){
        console.log("not found")
        res.redirect("./login");
    }else{
        const id = req.session.passport.user._id;
        User.findOne({_id:id},function(err,user){
            if(err){
                console.log(err);
            }else{
                if(user){
                    if(!user.hippo){
                        res.redirect("./findmyhippo");
                    }else{
                        const hippo = user.hippo;
                        User.findOne({_id:hippo},function(err,hippo){
                            if(err){
                                console.log(err);
                            }else{
                                if(hippo.hippo!=user._id){
                                    res.redirect("./findmyhippo");
                                }else{
                                    const newDiary={date:date,value:diary,name:user.name};
                                    user.ourdiary.push(newDiary);
                                    hippo.ourdiary.push(newDiary);
                                    hippo.save();
                                    user.save(function(){
                                        res.redirect("/ourdiary");
                                    });
                                }
                            }
                        })
                        
                    }
                }else{
                    console.log("User not found");
                    res.render("mydiary",{diaries:[],name:user.name,user:"",myDiary:false});
                }
            }
        });
    }  
});

app.post("/find",function(req,res){
    let userName = req.body.username;
    User.findOne({username:userName},function(err,user){
        if(!user){
            res.render("find",{send:"User Not Found",loginButton:false,veriCode:false});
        }else{
            res.render("find",{send:"Your Verification Code has been sent through Email:)",loginButton:false,veriCode:true});
        }
    });
    
});

app.listen(port,function(){
    console.log("Started on Port "+port);
})