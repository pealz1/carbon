; Carbon's additions to Tauri's NSIS installer (bundle > windows > nsis > installerHooks).

!macro NSIS_HOOK_POSTUNINSTALL
  ; "Open at startup" points at the Carbon just removed. Updates don't uninstall, but keep it then anyway.
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
  ${EndIf}
!macroend
