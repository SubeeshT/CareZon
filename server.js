const MongoStore = require('connect-mongo');
const express = require('express');
const app = express();
const path = require('path');
const env = require('dotenv').config();
const session = require('express-session');
const passport = require('./config/passport');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter')
db()

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ //tell express-session to use MongoDB also, for store session user data
        mongoUrl: process.env.MONGO_URI, //where to store sessions
        collectionName: 'sessions',
        ttl: 7 * 24 * 60 * 60 //7 days in seconds , TTL(Time To Live): How long MongoDB stores the session
    }),
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,//7 days in milliseconds , maxAge: How long the browser keeps the session cookie
        httpOnly: true,
        secure: false, //set to true in production with HTTPS
        sameSite: 'lax'
    }
}));

app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.set("view engine", "ejs");
app.set("views", [path.join(__dirname, "views/user"), path.join(__dirname, "views/admin"), path.join(__dirname, "views")]);
app.use(express.static(path.join(__dirname, "public")));
//app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(passport.initialize());
app.use(passport.session());

app.use('/', userRouter);
app.use('/admin',adminRouter);

const PORT = process.env.PORT || 3032
app.listen(PORT, () => console.log(`server running (CareZon)`));
