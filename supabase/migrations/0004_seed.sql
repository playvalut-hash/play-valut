-- 0004_seed.sql — play-valut seed data
-- Run after 0003_storage.sql. Re-runnable: everything uses ON CONFLICT DO NOTHING.
-- Sources: ~/workspace/game-portal-rebuild/games_seed.json, methods_seed.json
--
-- NOTE on artwork: icon_path is intentionally NULL for now — game artwork lives in
-- assets/game-icons/ of the old skeleton and must be re-uploaded to the public
-- 'game-icons' bucket before production (client must own licensed art). Until
-- then, the app falls back to the gradient colors recorded per game below
-- (c1 = gradient start, c2 = gradient end, from the skeleton seed data).

-- juwa:        c1 #7a1f1f → c2 #c8451b
-- juwa2:       c1 #5c1a2e → c2 #a8324f
-- orion:       c1 #0c2d4d → c2 #1565a8
-- fire:        c1 #5c1408 → c2 #d35400
-- panda:       c1 #123524 → c2 #1e7a4c
-- spin:        c1 #3a1150 → c2 #7a2ea0
-- milky:       c1 #241a4d → c2 #5b3ea8
-- vault:       c1 #3d2c07 → c2 #9a7414
-- river:       c1 #10334d → c2 #1b7a8c
-- frenzy:      c1 #0d3b2a → c2 #12996a
-- vegas:       c1 #4d0f2d → c2 #a3135c
-- mafia:       c1 #1c1c22 → c2 #4a4a58
-- cashm:       c1 #0d3b3b → c2 #128080
-- yolo:        c1 #4d3208 → c2 #b87a14
-- allin:       c1 #0f2d3d → c2 #1b6a8c
-- roll:        c1 #33124d → c2 #6a2ea0
-- mega:        c1 #4d1a08 → c2 #b85c14
-- thunder:     c1 #12294d → c2 #1e5aa8

insert into public.games
  (id, name, category, icon_path, link, web_link, access,
   first_bonus_pct, reg_bonus_pct, min_load, max_load, redeem_info,
   sort_order, is_active)
values
  ('juwa',    'Juwa 777',        'Slots & Fish',  null, 'https://juwa777.to/',                                   null, 'both', 50, 20, 1, 5000, '3×',  1, true),
  ('juwa2',   'Juwa 2',          'Slots & Fish',  null, null,                                                    null, 'both', 50, 20, 1, 5000, '3×',  2, true),
  ('orion',   'Orion Stars',     'Slots',         null, 'https://start.orionstars.vip:8580/index.html',           null, 'both', 100, 25, 1, 5000, '3×', 3, true),
  ('fire',    'Fire Kirin',      'Fish Arcade',   null, 'https://firekirin7777.com/',                             null, 'both', 50, 20, 1, 5000, '3×',  4, true),
  ('panda',   'Panda Master',    'Slots & Table', null, 'https://pandamaster777.us',                              null, 'both', 30, 15, 1, 5000, '3×',  5, true),
  ('spin',    'Spin City',       'Slots',         null, null,                                                    null, 'both', 40, 15, 1, 3000, '3×',  6, true),
  ('milky',   'Milky Way',       'Slots',         null, 'https://milkywayapp.xyz/',                               null, 'both', 40, 20, 1, 5000, '3×',  7, true),
  ('vault',   'Game Vault',      'Mixed Lobby',   null, 'https://wwwgamevault999.com/',                          null, 'both', 25, 10, 1, 5000, '3×',  8, true),
  ('river',   'River Sweeps',    'Sweeps Lobby',  null, null,                                                    null, 'both', 35, 15, 1, 5000, '3×',  9, true),
  ('frenzy',  'Cash Frenzy',     'Slots',         null, null,                                                    null, 'both', 60, 20, 1, 3000, '3×', 10, true),
  ('vegas',   'Las Vegas Sweeps','Sweeps Lobby',  null, null,                                                    null, 'both', 45, 15, 1, 5000, '3×', 11, true),
  ('mafia',   'Mafia',           'Slots & Table', null, null,                                                    null, 'both', 30, 10, 1, 3000, '3×', 12, true),
  ('cashm',   'Cash Machine',    'Slots',         null, null,                                                    null, 'both', 50, 20, 1, 2000, '3×', 13, true),
  ('yolo',    'Yolo',            'Slots & Fish',  null, null,                                                    null, 'both', 55, 20, 1, 3000, '3×', 14, true),
  ('allin',   'Mr All In One',   'Mixed Lobby',   null, null,                                                    null, 'both', 25, 10, 1, 5000, '3×', 15, true),
  ('roll',    'Vegas Roll',      'Table & Slots', null, null,                                                    null, 'both', 40, 15, 1, 5000, '3×', 16, true),
  ('mega',    'Mega Spin',       'Slots',         null, null,                                                    null, 'both', 65, 25, 1, 3000, '3×', 17, true),
  ('thunder', 'Ultra Thunder',   'Slots & Fish',  null, null,                                                    null, 'both', 50, 20, 1, 5000, '3×', 18, true)
on conflict (id) do nothing;

-- =====================================================================
-- payment_methods (5)
-- =====================================================================
insert into public.payment_methods
  (id, name, brand_color, account_name, handle, pay_link, note, sort_order, is_active)
values
  ('cash-app', 'Cash App', '#00D632', 'PlayVault Payments', '$PlayVaultPay',
   'https://cash.app/$PlayVaultPay',
   'Add your portal username in the payment note', 1, true),
  ('venmo',    'Venmo',    '#008CFF', 'PlayVault Payments', '@PlayVaultPay',
   'https://venmo.com/u/PlayVaultPay',
   'Send as friends & family', 2, true),
  ('zelle',    'Zelle',    '#6D1ED4', 'PlayVault Payments', '(555) 214-7789',
   null,
   'Zelle has no pay link — send from your bank app to this number', 3, true),
  ('chime',    'Chime',    '#00CE7D', 'PlayVault Payments', '$PlayVaultChime',
   null,
   null, 4, true),
  ('bitcoin',  'Bitcoin',  '#F7931A', 'PlayVault Wallet', 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
   null,
   'Network fees apply — send exact amount', 5, true)
on conflict (id) do nothing;

-- =====================================================================
-- branding — single row, defaults from PRD §3.10
-- =====================================================================
insert into public.branding (id) values (1)
on conflict (id) do nothing;
