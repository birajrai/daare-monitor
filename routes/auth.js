const express = require('express');
const users = require('../services/users');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();

router.get('/login', async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/admin');
    return res.render('auth-login', { title: 'Login', error: null });
  } catch (err) {
    return next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const user = await users.validateLogin(req.body.username, req.body.password);
    if (!user) return res.status(401).render('auth-login', { title: 'Login', error: 'Invalid credentials' });

    const token = await users.createSession(user.id);
    setSessionCookie(res, token);
    return res.redirect('/admin');
  } catch (err) {
    return next(err);
  }
});

router.get('/register', async (req, res, next) => {
  try {
    if (await users.hasAnyUsers()) return res.redirect('/auth/login');
    return res.render('auth-register', { title: 'Register', error: null });
  } catch (err) {
    return next(err);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const result = await users.registerInitialUser(req.body.username, req.body.password);
    if (result.error) {
      const status = result.status || 400;
      return res.status(status).render('auth-register', { title: 'Register', error: result.error });
    }

    const user = await users.validateLogin(req.body.username, req.body.password);
    const token = await users.createSession(user.id);
    setSessionCookie(res, token);
    return res.redirect('/admin');
  } catch (err) {
    return next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    if (req.sessionToken) await users.clearSession(req.sessionToken);
    clearSessionCookie(res);
    return res.redirect('/auth/login');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
