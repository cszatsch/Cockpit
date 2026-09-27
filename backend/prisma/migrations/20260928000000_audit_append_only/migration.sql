-- RG13-15 : le journal d'audit n'est ni modifiable ni supprimable.
CREATE OR REPLACE FUNCTION audit_entry_immutable() RETURNS trigger AS $$
BEGIN
  IF current_setting('rise.allow_audit_purge', true) = 'on' AND TG_OP = 'DELETE' THEN
    RETURN OLD; -- purge de conservation (24 mois) uniquement
  END IF;
  RAISE EXCEPTION 'AuditEntry is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_entry_no_update BEFORE UPDATE ON "AuditEntry"
  FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();
CREATE TRIGGER audit_entry_no_delete BEFORE DELETE ON "AuditEntry"
  FOR EACH ROW EXECUTE FUNCTION audit_entry_immutable();
