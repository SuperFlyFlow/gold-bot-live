# Gold Bot Live

Phone-installable dashboard for the gold bot demo account. Static site (GitHub Pages) that signs in with
Supabase Auth and reads the bot's reports through the `get_dashboard()` database function, which only answers
accounts on the allow-list. The Supabase key in `app.js` is the project's publishable key: on its own it can't
read any data.
