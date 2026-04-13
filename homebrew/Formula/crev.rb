class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.1.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v#{version}/crev-darwin-arm64"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/caiokf/crev/releases/download/v#{version}/crev-darwin-x64"
      sha256 "PLACEHOLDER"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v#{version}/crev-linux-arm64"
      sha256 "PLACEHOLDER"
    else
      url "https://github.com/caiokf/crev/releases/download/v#{version}/crev-linux-x64"
      sha256 "PLACEHOLDER"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
