# RAM database security follow-up — 20 October 2026

This record supersedes the database-access and pending-migration statements in the 19 October audit. Application production remains commit `62a47a25a71538bbe7363835b4417f2a54385486`, Worker version `3c4d97d5-4ee7-452d-a68a-44cde00e937e`. No frontend/Worker deployment is required for these SQL changes.

## Target and access

Udi's signed-in Chrome profile successfully opened the Supabase dashboard for **RAM Engineering CRM**, project **qvunspguudkhwgbjvvuf**, organization `zdcwdjxhapjnvswnihwp`. Dashboard SQL execution works. The unrelated StudentTranscribe project was never used. CLI SQL access and connector account selection remain separate unresolved access paths, not blockers for this dashboard release.

## Backup and recovery evidence

Before changes, a repeatable-read transaction created `rameng_private.audit_20261020_snapshot`. It contains all five application tables (13 records total: workspace 1, organizations 1, memberships 3, project collaborators 1, task notifications 7), 21 function definitions with owners/ACLs, and three workspace trigger definitions: **37 snapshot rows**. RLS is enabled; PUBLIC, anon, authenticated and service_role have no table privileges. The live workspace matched the snapshot exactly before and after the first migration.

A CSV export was downloaded and moved outside the repository into the current Windows user's restricted backup folder. All JSON payloads parsed successfully. A Windows DPAPI CurrentUser encrypted copy decrypted to the original bytes. CSV SHA-256: `AAD9B8BF9D99F4F8FFFF5A5BE11F0764CCF04A6A5F6A840EB654FF14928BEB18`. No customer payload or credentials were logged or committed.

Isolated PostgreSQL restoration reproduced all 13 application records with exact JSONB equality, including timestamps after setting UTC. Applying the deletion/status migration to the restored baseline and editing an existing task succeeded. This is an application-data extraction/restore check, not a complete Supabase service restore: Auth credentials/sessions, Storage objects, platform internals, KV and secrets are excluded. No physical backups are listed and PITR is disabled. Full disaster-recovery retention/RPO/RTO remain unverified.

For schema rollback, use the original helper definition and ACL saved in the private snapshot/export; remove only the new `validate_task_statuses` trigger and private function if the release is proven defective. Test rollback in an isolated database first. Never replay the data snapshot over live production or rerun `setup.sql` to undo a schema change. An app rollback does not undo SQL changes. No production rollback or customer-data restoration was performed.

## Applied deletion/status migration

`supabase/migrations/20261019202318_enforce_nested_entity_delete_permissions.sql` was executed through the RAM SQL Editor at approximately **2026-10-20 02:15 UTC / 05:15 Israel**. Its transaction completed successfully. It fixes nested deletion detection when an entity collection is omitted, null or replaced by another JSON type, and protects configured task statuses at database level. It does not rewrite customer records.

Production verification used only a temporary synthetic table within a rolled-back transaction. **8 checks passed:** omitted collection, null collection, type replacement, ordinary scalar-list editing, unknown status rejection, built-in status removal rejection, assigned custom status removal rejection, and atomic custom-status rename/reassignment. Metadata confirmed the real workspace trigger is enabled, anonymous helper execution is denied, and the workspace is unchanged from backup. This does not certify every live user/permission combination.

The project previously had no CLI migration history; dashboard changes do not fabricate a history containing only this migration. Operators must reconcile the existing live schema before any future blanket migration push.

## Advisor follow-up

The live Security Advisor initially showed **0 errors, 16 warnings, 5 informational suggestions**. Fourteen warnings identify authenticated SECURITY DEFINER entrypoints, one identifies public execution of `rls_auto_enable()`, and one identifies disabled leaked-password protection. Authenticated entrypoints must retain their explicit authorization checks; removing them wholesale would break the application.

`20261020021737_restrict_rls_event_trigger_execution.sql` narrows EXECUTE on the optional platform event-trigger function, preserving its definition and event dispatch. It fails closed on an unexpected return type and is a no-op when absent. It is prepared and locally tested; final application/advisor results follow CI and deployment verification.

Disposable PostgreSQL passes the baseline plus all **8** migrations, the existing **24 assertion / 20 expected-denial** workflow, and an added platform fixture verifying that client EXECUTE is removed while DDL event dispatch still enables RLS on new public tables. Both absence and presence of the optional function are exercised.

Leaked-password protection is unchanged. No subscription, OAuth scope, credential, sharing or paid feature was changed. The organization email journal/review queue, live Google writes, complete password lifecycle, full report/PDF issuance and broad ERP readiness remain outstanding.
