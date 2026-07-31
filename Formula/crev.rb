class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.10.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.10.0/crev-darwin-arm64"
      sha256 "07ab3d3bcf8fecfe5ec168b8d512d555e0a053bec5cc00bc3a4e210046cc8827"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.10.0/crev-darwin-x64"
      sha256 "0f8d466ae26189eb641229eef2f8f591a6ad5696ecfae578b64b9c655ff87984"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.10.0/crev-linux-arm64"
      sha256 "95d5f48cf9cbbd4ca4d8487ec04a0b386ca2492bcf247a8dca86ebc509e5f440"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.10.0/crev-linux-x64"
      sha256 "49780cbfa2b76e40ee8f382ce50024f4fb8358d8ad88a3bf1b7b85b4af7e42a6"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
