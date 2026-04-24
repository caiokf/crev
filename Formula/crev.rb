class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.8.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.8.0/crev-darwin-arm64"
      sha256 "93dc8f398dddd28e3f06fd375d9530992012671f40e1933cd8f01637aa11ab79"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.8.0/crev-darwin-x64"
      sha256 "9c8919488be103165eb89b355dd3cdfd7ae6deb89c44f3e3033c43f5833f17f0"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.8.0/crev-linux-arm64"
      sha256 "9f1a502374bdc48f41307f96c9fd64b921d3dcad513e5af4ab4bfc665c1363e0"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.8.0/crev-linux-x64"
      sha256 "0f00f6a912280c4b49baf9f01c561394c4e4bcf013a93152223c405416721e04"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
