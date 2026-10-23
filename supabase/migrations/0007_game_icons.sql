-- Migration: Update game icons with machinebreakershub.com artwork
-- Run this in Supabase SQL Editor

UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-juwa.webp' WHERE name ILIKE '%juwa%' AND name NOT ILIKE '%2%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-juwa2.webp' WHERE name ILIKE '%juwa 2%' OR name ILIKE '%juwa2%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-orionstars.webp' WHERE name ILIKE '%orion%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-firekirin.webp' WHERE name ILIKE '%fire kirin%' OR name ILIKE '%firekirin%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-pandamaster.webp' WHERE name ILIKE '%panda%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-spincity.webp' WHERE name ILIKE '%spin city%' OR name ILIKE '%spincity%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-milkyway.webp' WHERE name ILIKE '%milky%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-game_vault.webp' WHERE name ILIKE '%game vault%' OR name ILIKE '%gamevault%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-riversweeps.webp' WHERE name ILIKE '%river%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-cashfrenzy.webp' WHERE name ILIKE '%cash frenzy%' OR name ILIKE '%cashfrenzy%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-lasvegassweeps.webp' WHERE name ILIKE '%vegas sweeps%' OR name ILIKE '%las vegas%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-mafia.webp' WHERE name ILIKE '%mafia%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-cash_machine.webp' WHERE name ILIKE '%cash machine%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-yolo.webp' WHERE name ILIKE '%yolo%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-mrallinone.webp' WHERE name ILIKE '%all in one%' OR name ILIKE '%mr all%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-vegas_roll.webp' WHERE name ILIKE '%vegas roll%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-megaspin.webp' WHERE name ILIKE '%mega spin%' OR name ILIKE '%megaspin%';
UPDATE games SET icon_path = 'https://machinebreakershub.com/api/uploads/game-icons/hd-ultrathunder.png' WHERE name ILIKE '%ultra thunder%' OR name ILIKE '%ultrathunder%';

-- Verify
SELECT name, icon_path FROM games WHERE is_active = true ORDER BY sort_order;
