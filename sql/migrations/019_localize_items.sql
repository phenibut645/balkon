ALTER TABLE items
    ADD COLUMN name_ru VARCHAR(255) NULL AFTER description,
    ADD COLUMN name_en VARCHAR(255) NULL AFTER name_ru,
    ADD COLUMN name_et VARCHAR(255) NULL AFTER name_en,
    ADD COLUMN description_ru TEXT NULL AFTER name_et,
    ADD COLUMN description_en TEXT NULL AFTER description_ru,
    ADD COLUMN description_et TEXT NULL AFTER description_en;
