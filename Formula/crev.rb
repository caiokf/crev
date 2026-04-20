class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.5.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.5.1/crev-darwin-arm64"
      sha256 "d1d5ce56128854307a1e2a0c2031dcfe01672dabb6d830d997709f558d9993bf"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.5.1/crev-darwin-x64"
      sha256 "aea80e02ef25445a93271c433c96246012beffd0c0eb1e888ef195cca63db60c"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.5.1/crev-linux-arm64"
      sha256 "15a382d51cd3212118d283a404f9ffe915c3002dd4086594a145f786da538a76"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.5.1/crev-linux-x64"
      sha256 "cb916a2465de9f14396f05b2a29332b172e24c902642d97ee4029322df1fc1f6"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
