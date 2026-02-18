const express = require('express');
const users = require('../services/users');
const { setSessionCookie, clearSessionCookie } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    if (req.user) return res.redirect('/admin');
    const hasUsers = await users.hasAnyUsers();
    return res.render('auth-login', {
      title: hasUsers ? 'Login' : 'Create Admin User',
      error: null,
      hasUsers,
    });
  } catch (err) {
    return next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const hasUsers = await users.hasAnyUsers();
    if (!hasUsers) {
      const result = await users.registerInitialUser(req.body.username, req.body.password);
      if (result.error) {
        const status = result.status || 400;
        return res.status(status).render('auth-login', {
          title: 'Create Admin User',
          error: result.error,
          hasUsers: false,
        });
      }
    }

    const user = await users.validateLogin(req.body.username, req.body.password);
    if (!user) {
      return res.status(401).render('auth-login', {
        title: 'Login',
        error: 'Invalid credentials',
        hasUsers: true,
      });
    }

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
    return res.redirect('/auth');
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
