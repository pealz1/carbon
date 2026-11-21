; Carbon's additions to Tauri's NSIS installer (bundle > windows > nsis > installerHooks).

!macro NSIS_HOOK_POSTINSTALL
  ; Win+R, Start search and other launchers find Carbon by its program name. Updates write it
  ; too, so installs from before this get it on their next update.
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe"
  WriteRegStr SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe" "Path" "$INSTDIR"

  ; Put "Open at startup" back if the uninstall before this install (a hand-run upgrade or a
  ; reinstall) had it on.
  ReadRegStr $R9 SHCTX "${MANUPRODUCTKEY}" "OpenAtStartup"
  ${If} $R9 == "1"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}" '"$INSTDIR\${MAINBINARYNAME}.exe" --minimized'
    DeleteRegValue SHCTX "${MANUPRODUCTKEY}" "OpenAtStartup"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Remember "Open at startup" before the uninstall removes it, beside the install folder Tauri
  ; keeps for the next install. Ticking "Delete the application data" clears this key too.
  ${If} $UpdateMode <> 1
    ReadRegStr $R9 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    ${If} $R9 != ""
      WriteRegStr SHCTX "${MANUPRODUCTKEY}" "OpenAtStartup" "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Leave nothing pointing at the Carbon just removed. Updates don't uninstall, but keep it then anyway.
  ${If} $UpdateMode <> 1
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCTNAME}"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "${PRODUCTNAME}"
    DeleteRegKey SHCTX "Software\Microsoft\Windows\CurrentVersion\App Paths\${MAINBINARYNAME}.exe"
  ${EndIf}
!macroend
