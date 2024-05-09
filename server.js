import "dotenv/config"; 
import chalk from "chalk";
import express from "express";
import morgan from "morgan";
import passport from "passport";
import auth from "./routes/authentication.js";
import apiRoute from "./routes/apiRoute.js"
import session from "express-session";
import OAuth2Strategy from "passport-google-oauth20";
import cors from "cors";
import userdb from "./model/userSchema.js";
import connectionToDB from "./db/connection.js";
import rateLimit from "express-rate-limit";


await connectionToDB(); 

const app = express();
// Middleware 
app.use(express.json()); 

app.use(cors({
    origin: 'http://localhost:3000',
    methods: ['GET','PUT','POST', 'DELETE','OPTIONS'],
    credentials: true
}));

app.set('trust proxy', 1);
app.use(session({
    secret: process.env.SECRET_SESSION,
    resave: true, //we dont want to save a session if nothing is modified
    saveUninitialized: false, //dont create a session until something is stored
    cookie: {
      maxAge: 1000, // 7 days
      secure: "auto",
      sameSite: "none", //Enable when deployment OR when not using localhost, We're not on the same site, we're using different site so the cookie need to effectively transfer from Backend to Frontend
    },
  }));

if(process.env.NODE_ENV === 'development'){
    app.use(morgan("dev")); 
}

const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 20, 
    message: "Too many requests from this IP, please try again after some time...."
});

const checkAuthenticated = (req, res, next) => {
    if(req.isAuthenticated()){
        return next(); 
    }
    res.redirect("https://socialscribe-aipoool.onrender.com/login");
}

app.use(limiter);

app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Methods', 'PUT, POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With');
    next();
 });

// setup session 
/**
 * This session is used to encrypt the user data 
 * Similar to jwt token services
 **/
// app.use(session({
//     secret: process.env.SECRET_SESSION,
//     resave: false,
//     saveUninitialized: true
// }))


// setup passport 
app.use(passport.initialize());
app.use(passport.session());

passport.use(
        new OAuth2Strategy.Strategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL, 
        scope: ["profile", "email"]
    }, 
    async (accessToken, refreshToken, profile, done) => {
        console.log("Profile: ", profile); 
        const existingUser = await userdb.findOneAndUpdate({googleId: profile.id},{
            accessToken, 
            refreshToken, 
            googleId: profile.id, 
            userName: profile.displayName, 
            email: profile.emails[0].value,
        })

        if(existingUser){
            return done(null, existingUser); 
        }

        const newUser = await new userdb({
            accessToken, 
            refreshToken, 
            googleId: profile.id, 
            userName: profile.displayName, 
            email: profile.emails[0].value,
            }).save(); 
        
        done(null, newUser);
    }
));

passport.serializeUser((user, done)=>{
    done(null, user.id);
})

passport.deserializeUser((id, done)=>{
    userdb.findById(id).then(user => {
        done(null, user)
    })
})

///app.use("/auth" , auth);
/**AUTH FILES ROUTES PASTING HERE FOR CHECKING THE FUNCTIONALITY */

// Testing routes 
    app.get("/auth/test", (req, res) => {
        res.json({Hi: "This is the AUTH Route, after the edits have been made "}); 
    })
  
  // initial google oauth login 
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get("/auth/google/callback", passport.authenticate("google", 
  { 
      failureRedirect: "http://localhost:3000/login", 
      successRedirect: "http://localhost:3000/enter-your-key"
  }));
  
  
  app.get("/auth/login/success", async (req, res) => {
    console.log("Request data from login/success : ", req.user); 
    if(req.user){
        res.status(200).json({message: "User Login" , user:req.user});
        console.log('Entered the login success route');
    }
    else{
        res.status(403).json({message: "User Not Authorized"});
    }
    // if(req.user){
    //     //console.log(req.user.accessToken)
    //     console.log(req.user)
    //     if(req.user.accessToken){
    //         res.status(200).json({message: "User Login" , user:req.user});
    //         console.log(req.user); 
    //         //const User = req.user;
    //         // // setting the jwt token 
    //         // jwt.sign({User}, process.env.JWT_KEY, (err, token) => {
    //         //     res.status(200);
    //         //     res.send({User, auth: token});
    //         // })
    //     }
        
    // }else {
    //     res.status(400).json({message: "Not Authorized"}); 
    // }
  });
  
  app.post("/auth/enter-your-key/success", async (req, res) => {
    const { id, openAIKey } = req.body;
    console.log("Path is enter-your-key/success ",id, openAIKey);
    try {
      await userdb.findOneAndUpdate(
        { _id: id },
        {$set: {
            openAIKey: openAIKey} },
        { new: true, useFindAndModify: false }
      );
      res.send({ message: 'OpenAI Key updated successfully' });
    } catch (error) {
      console.error('Error updating OpenAI Key:', error);
      res.status(500).send({ message: 'Error updating OpenAI Key' });
    }
  });
  
  app.get('/auth/logout', async (req, res, next) => {
  
    req.logout(function(err) {
      if (err) {
         return next(err); 
      }
      res.redirect('http://localhost:3000/login');
    });
  
  });



//////////////////////////////////////////////////////////////////////
app.use("/api", checkAuthenticated , apiRoute);


// Testing routes 
app.get("/test", (req, res) => {
    res.json({Hi: "This is a... testing message"}); 
})

const PORT = process.env.PORT || 1997; 

app.listen(PORT , ()=> {
    console.log(
        `${chalk.green.bold("✅")} 👍Server running in ${chalk.yellow.bold(process.env.NODE_ENV)} mode on port ${chalk.blue.bold(PORT)}`
    );
})



