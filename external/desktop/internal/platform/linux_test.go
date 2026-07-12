//go:build linux && tray

package platform

import "testing"

func TestDecodeIconReturnsBytes(t *testing.T) {
	if got := decodeIcon(healthyIconBase64); len(got) == 0 {
		t.Fatal("decodeIcon returned no bytes")
	}
}

func TestLimitMenuText(t *testing.T) {
	short := "short text"
	if got := limitMenuText(short); got != short {
		t.Fatalf("limitMenuText(short) = %q", got)
	}

	long := "12345678901234567890123456789012345678901234567890"
	if got := limitMenuText(long); got != "123456789012345678901234567890123456789012345678..." {
		t.Fatalf("limitMenuText(long) = %q", got)
	}
}

func TestFormatUpdatedAt(t *testing.T) {
	if got := formatUpdatedAt(""); got != "-" {
		t.Fatalf("formatUpdatedAt(\"\") = %q", got)
	}

	if got := formatUpdatedAt("2026-07-12T21:40:00.000Z"); got != "2026-07-12T21:40Z" {
		t.Fatalf("formatUpdatedAt(iso) = %q", got)
	}

	if got := formatUpdatedAt("short"); got != "short" {
		t.Fatalf("formatUpdatedAt(short) = %q", got)
	}
}

func TestDisplayVersion(t *testing.T) {
	if got := displayVersion(""); got != "dev" {
		t.Fatalf("displayVersion(\"\") = %q", got)
	}
	if got := displayVersion("1.2.3"); got != "1.2.3" {
		t.Fatalf("displayVersion(\"1.2.3\") = %q", got)
	}
}
