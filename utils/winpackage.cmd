@echo off
:: This is for packaging under windows.
:: Currently requires Powershell 6 or newer, which is standard with Windows 10. If you need to support older versions of Windows, use the vbs version included below.

:: We want variables to disappear when cmd file exits
setlocal

:: Set variables. Use single-quotes if names contain spaces.
set Source=build
set ZipFile=azad.zip


:: Go to parent of folder containing this cmd.
cd "%~dp0.."

::  run lint
node node_modules\eslint\bin\eslint.js src/js
if %errorlevel% gtr 0 goto :EOF

:: run npm build command
cmd /C npm run %Source%
if %errorlevel% gtr 0 echo Build errorcode %errorlevel%
if %errorlevel% gtr 0 goto :EOF

:: Delete old package
del %ZipFile%
:: Create new package. Windows does not have a commandline zip command, so this is the alternate. Must have Powershell installed.
powershell -ExecutionPolicy ByPass -Command Compress-Archive %Source% %ZipFile%

:: echo.123456789_123456789_123456789_123456789_123456789_123456789_123456789_12
echo.########################################################################
echo.# To test changes, go to chrome://extensions, enable Developer mode,
echo.#   remove the store version of the extension, click "Load unpacked",
echo.#   navigate to
echo.#   %CD%\%Source%
echo.#   then click the Select Folder button.
echo.# When changes are tested and satisfactory, use GitHub Desktop to upload
echo.#   them to GitHub, then submit a Pull Request.
echo.# If you are the extension owner, go to
echo.#   https://chrome.google.com/webstore/developer/edit/mgkilgclilajckgnedgjgnfdokkgnibi
echo.#   and upload %CD%\%ZipFile%.
echo.########################################################################

endlocal
:: End of execcution.
goto :EOF

:: ###############################################################################################
:: The text below is skipped.






:: Use this instead of powershell for older versions of Windows; supposedly will support back to Windows 98 or Internet Explorer 5.
:: Note that this version has a kludgy time delay.

cscript utils\zipcmd.vbs %Source% %ZipFile%


:: zipcmd.vbs follows:

// This is a "poor man's zip utility", since Windows doesn't have a built-in zip command-line utility.
// The oldest source of this which I could find, dated 2006-05-17, is https://www.tek-tips.com/viewthread.cfm?qid=1231429
// 2011-11-19 modern appearance: http://www.block-net.de/Programmierung/scripts/scripts.html
// 2011-07-04: http://qtpknowledgesharing.blogspot.com/2011/07/function-to-create-zip-file-of-folder.html
// (2010): https://superuser.com/questions/110991/can-you-zip-a-file-from-the-command-prompt-using-only-windows-built-in-capabili

Set objArgs = WScript.Arguments
Set FS = CreateObject("Scripting.FileSystemObject")
InputFolder = FS.GetAbsolutePathName(objArgs(0))
ZipFile = FS.GetAbsolutePathName(objArgs(1))

CreateObject("Scripting.FileSystemObject").CreateTextFile(ZipFile, True).Write "PK" & Chr(5) & Chr(6) & String(18, vbNullChar)

Set objShell = CreateObject("Shell.Application")
Set source = objShell.NameSpace(InputFolder).Items

objShell.NameSpace(ZipFile).CopyHere(source)
wScript.Sleep 3000

