# Homebrew formula for the Orchentra CLI (binary-only).
#
# Real sha256 values are filled in per release by
# scripts/update-homebrew-formula.sh <tag>. The placeholders below (64 zeros)
# are intentional until a real release exists to compute them from. Each sha256
# line is tagged with a trailing "# <target>" comment so the updater can splice
# by target rather than by position.
#
# Note: the clean `brew install athrean/orchentra/orchentra` one-liner only works
# once a separate Athrean/homebrew-orchentra tap repo hosts this formula (an
# owner step). Until then, install via the curl script in apps/cli/scripts/.
class Orchentra < Formula
  desc "Local-first coding harness from Athrean Lab"
  homepage "https://github.com/Athrean/Orchentra"
  version "0.9.0"
  license "Apache-2.0"

  on_macos do
    on_arm do
      url "https://github.com/Athrean/Orchentra/releases/download/v#{version}/orchentra-darwin-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000" # darwin-arm64
    end
    on_intel do
      url "https://github.com/Athrean/Orchentra/releases/download/v#{version}/orchentra-darwin-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000" # darwin-x64
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/Athrean/Orchentra/releases/download/v#{version}/orchentra-linux-arm64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000" # linux-arm64
    end
    on_intel do
      url "https://github.com/Athrean/Orchentra/releases/download/v#{version}/orchentra-linux-x64"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000" # linux-x64
    end
  end

  def install
    # The release asset downloads under its target-suffixed name; stage it as the
    # plain `orchentra` binary and add the `otr` alias alongside it.
    bin.install Dir["orchentra-*"].first => "orchentra"
    bin.install_symlink "orchentra" => "otr"
  end

  test do
    assert_match "orchentra #{version}", shell_output("#{bin}/orchentra --version")
  end
end
