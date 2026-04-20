class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.5.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.5.0/crev-darwin-arm64"
      sha256 "40e306424ac964cb1aa60fa9e4e7aaa2cd37b3a68a11bc66f05c9a4de43d9f26"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.5.0/crev-darwin-x64"
      sha256 "c0b92757d09b5aec7cd503b67eeb245eab7985f0a86ccbd4f315c9b8b94d468a"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.5.0/crev-linux-arm64"
      sha256 "27ea8661d573056c919e6ec30e11b4c738bf1bc2fca5240299e440a9fee581c1"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.5.0/crev-linux-x64"
      sha256 "0562e7ecc9af2935b7548022646cd80606222461b070ce7859910d2833273bc4"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
