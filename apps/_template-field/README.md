# Field module template

Copy this directory to start a new field module. Do not edit it in place.

```
cp -R apps/_template-field apps/field-<module>
```

Then update `package.json` name, and the module code in the app config.

What the template already handles, so it is not reimplemented per module:

- Pairing via printed QR, one-shot, device + module
- Ticket check at boot — farm ceiling and device floor
- Outbox wiring and background sync
- Season resolution on the device
- Offline-first save with immediate local confirmation
- AF/EN strings and field UI primitives
