-- The body of "Ardenhaven VTT.app" — see build-notifier.sh.
--
-- It reads its payload from a file rather than from arguments, because an osacompiled
-- applet receives neither `argv` when exec'd directly nor `--args` passed through
-- `open -a`. Both were tested; both arrive empty. A payload file is the only reliable
-- channel, and it also keeps the message text out of the process list.
--
-- Payload format, deliberately line-oriented so AppleScript can parse it without a
-- JSON library:
--
--   line 1  title
--   line 2  subtitle
--   line 3  sound name, or "-" for silent
--   line 4  "modal" to also raise a blocking alert, or "-"
--   line 5+ the message body
--
-- The modal is the answer to "don't let this be skipped by my silence". macOS gates
-- Time Sensitive notifications behind an entitlement no third-party app can get, so a
-- banner is always suppressible by a Focus. An alert window is not a notification — it
-- is UI, it ignores Focus entirely, and it stays on screen until it is clicked. It is
-- used only for the two classes that genuinely need a human.

on run
	-- build-notifier.sh substitutes the repo's real path here at compile time, so the
	-- applet does not carry a guess about where the checkout lives.
	set payloadPath to "@@PAYLOAD_PATH@@"
	try
		set raw to read POSIX file payloadPath as «class utf8»
	on error
		return
	end try

	set AppleScript's text item delimiters to linefeed
	set lines_ to text items of raw
	set AppleScript's text item delimiters to ""

	if (count of lines_) < 5 then return
	set theTitle to item 1 of lines_
	set theSubtitle to item 2 of lines_
	set theSound to item 3 of lines_
	set theModal to item 4 of lines_

	set bodyLines to items 5 thru (count of lines_) of lines_
	set AppleScript's text item delimiters to linefeed
	set theMessage to bodyLines as string
	set AppleScript's text item delimiters to ""

	if theSound is "-" then
		display notification theMessage with title theTitle subtitle theSubtitle
	else
		display notification theMessage with title theTitle subtitle theSubtitle sound name theSound
	end if

	if theModal is "modal" then
		tell me to activate
		try
			display alert theTitle message theMessage as critical buttons {"OK"} default button "OK"
		end try
	end if
end run
