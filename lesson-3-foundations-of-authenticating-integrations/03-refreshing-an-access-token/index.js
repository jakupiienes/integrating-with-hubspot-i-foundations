require("dotenv").config();
const express = require("express");
const querystring = require("querystring");
const axios = require("axios");
const session = require("express-session");
const NodeCache = require("node-cache");
const { query } = require("express");
const util = require("util");

const app = express();

app.set("view engine", "pug");

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const REDIRECT_URI = `http://localhost:3000/oauth-callback`;

const authUrl = `https://app-eu1.hubspot.com/oauth/authorize?client_id=dc963251-ef14-408e-9ba0-925029c166c9&redirect_uri=http://localhost:3000/oauth-callback&scope=crm.objects.contacts.write%20crm.schemas.contacts.write%20oauth%20crm.schemas.contacts.read%20crm.objects.contacts.read`;

const refreshTokenStore = {};
const accessTokenCache = new NodeCache({ deleteOnExpire: true });

app.use(
  session({
    secret: Math.random().toString(36).substring(2),
    resave: false,
    saveUninitialized: true,
  })
);

const isAuthorized = (userId) => {
  return refreshTokenStore[userId] ? true : false;
};

const getToken = async (userId) => {
  if (accessTokenCache.get(userId)) {
    // console.log(accessTokenCache.get(userId));
    return accessTokenCache.get(userId);
  } else {
    try {
      const refreshTokenProof = {
        grant_type: "refresh_token",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        refresh_token: refreshTokenStore[userId],
      };
      const responseBody = await axios.post(
        "https://api.hubapi.com/oauth/v1/token",
        querystring.stringify(refreshTokenProof)
      );
      refreshTokenStore[userId] = responseBody.data.refresh_token;
      accessTokenCache.set(
        userId,

        responseBody.data.access_token,

        Math.round(responseBody.data.expires_in * 0.75)
      );

      console.log("Getting refresh token");
      return responseBody.data.access_token;
    } catch (error) {
      console.error(error);
    }
  }
};

// * 1. Send user to authorization page. This kicks off initial requeset to OAuth server.
app.get("/", async (req, res) => {
  if (isAuthorized(req.sessionID)) {
    const accessToken = await getToken(req.sessionID);
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };
    const contacts = `https://api.hubapi.com/crm/v3/objects/contacts`;
    try {
      const resp = await axios.get(contacts, { headers });
      const data = resp.data;
      res.render("home", {
        token: accessToken,
        contacts: data.results,
        data: data,
      });
    } catch (error) {
      console.error(error);
    }
  } else {
    res.render("home", { authUrl });
  }
});

// * 2. Get temporary authorization code from OAuth server.
// * 3. Combine temporary auth code wtih app credentials and send back to OAuth server.
app.get("/oauth-callback", async (req, res) => {
  const authCodeProof = {
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    code: req.query.code,
  };
  try {
    const responseBody = await axios.post(
      "https://api.hubapi.com/oauth/v1/token",
      querystring.stringify(authCodeProof)
    );
    // * 4. Get access and refresh tokens.
    refreshTokenStore[req.sessionID] = responseBody.data.refresh_token;
    accessTokenCache.set(
      req.sessionID,

      responseBody.data.access_token,

      Math.round(responseBody.data.expires_in * 0.75)
    );
    res.redirect("/");
  } catch (error) {
    console.error(error);
  }
});

// * 4. Get access and refresh tokens.

app.listen(3000, () => console.log("App running here: http://localhost:3000"));
