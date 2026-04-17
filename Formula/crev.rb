class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.4.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.2/crev-darwin-arm64"
      sha256 "5f51fd0c448a67d3011241ae3fa95c53e790ff8f96d9dbedd4427d31c971ad71"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.2/crev-darwin-x64"
      sha256 "f66be1628c258cd9aef23e540d7d03d3f48bfc346a2bad2d734c8b584cf9cbe2"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.2/crev-linux-arm64"
      sha256 "e685498f8dd8f91618533368c7fd37bb280f0b45b415122e764842cdba1f12dc"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.2/crev-linux-x64"
      sha256 "2606653ae38236ecaf46b5e72783d653320b6063b1a65a4cf1efa7cfbc5088d6"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
