class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.7.2"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.2/crev-darwin-arm64"
      sha256 "98872c10a6758a7ffc789cd06ff7e6978f980fe687e5d5c63feb25f3149b9e8d"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.2/crev-darwin-x64"
      sha256 "2cf48a146cce1405e91bc68a2dc6e2646bc9ab32bfe1eca8fc9f13b8ed26b595"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.2/crev-linux-arm64"
      sha256 "8ff192dff9f7655d71264fea9f6c31d44a3ede63c8e1a62b464da86ae3fb18d4"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.2/crev-linux-x64"
      sha256 "e7ce9c8af242b32596751c2627f9d0318a9ced8f2073418ec281ef751af317fd"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
