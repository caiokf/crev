class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.2.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.2.0/crev-darwin-arm64"
      sha256 "49dc65194b54f3f96bca346dd09a65ff9d6246ff045ad583caa8094afdc1e013"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.2.0/crev-darwin-x64"
      sha256 "8aa0a502725cc165214875cfb4aa42b42836b1b418b0bf0476f66e8482648ee9"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.2.0/crev-linux-arm64"
      sha256 "de61da9fc55c10ce2c7ca20e0ab42e85110c0563ce634360c5205c82d14c877e"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.2.0/crev-linux-x64"
      sha256 "674ff14613255edf6465b3311a88f044eb4c7453811b1d3f04eca525abf42c42"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
