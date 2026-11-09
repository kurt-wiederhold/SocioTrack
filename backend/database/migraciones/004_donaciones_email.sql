-- Correo del donante: Causaxcausa lo trae casi siempre y el RUT casi nunca.
-- Ejecutar UNA sola vez:  mysql africadream < database/migraciones/004_donaciones_email.sql
ALTER TABLE donaciones ADD COLUMN email VARCHAR(190) NULL AFTER rut;
