class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.7.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.1/crev-darwin-arm64"
      sha256 "1d288408ac15f68ce62b8eb87df4003f3efd53b834057c2ec029792ce3cf2968"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.1/crev-darwin-x64"
      sha256 "cb9176ce2d8b4c21479ff2b4d353eacd83574b74a3cc0adeb70957a7f8e76a17"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.1/crev-linux-arm64"
      sha256 "546c5225d2b5a812ad2120442eff4cb1629a0cad40811919a91539fe5b354ba8"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.1/crev-linux-x64"
      sha256 "6d1349c80f53869e55cd3e05a96f4493fef59d9662c876fd024bccdf227b74f8"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
