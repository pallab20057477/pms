-- Migration 007: Add festive side panel columns to hotel_themes table
-- These power the left/right flanking panels on the public booking portal

ALTER TABLE hotel_themes
  ADD COLUMN IF NOT EXISTS left_panel_image_url  TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_title       VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_subtext     VARCHAR(400) DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_btn_text    VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_btn_url     TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_bg_from     VARCHAR(20) DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_bg_to       VARCHAR(20) DEFAULT '',
  ADD COLUMN IF NOT EXISTS left_panel_text_color  VARCHAR(20) DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS right_panel_image_url  TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_title      VARCHAR(200) DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_subtext    VARCHAR(400) DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_btn_text   VARCHAR(100) DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_btn_url    TEXT        DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_bg_from    VARCHAR(20) DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_bg_to      VARCHAR(20) DEFAULT '',
  ADD COLUMN IF NOT EXISTS right_panel_text_color VARCHAR(20) DEFAULT '#ffffff';
