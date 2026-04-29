class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.9.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.9.0/crev-darwin-arm64"
      sha256 "f2cd60bee1b44281654689deddb358c72271385fb8dc68fe1dc91ee4ca88d878"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.9.0/crev-darwin-x64"
      sha256 "009130c839db9692153363a73435dac93c3ed1071a5e3aa6c1fd544030157084"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.9.0/crev-linux-arm64"
      sha256 "5e203895758da66738d0faefb8b770c8eed05cb5ec183c5f08ce0af0566121c7"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.9.0/crev-linux-x64"
      sha256 "03c57c3f3d46ba2e86d13994e6be663cf8e4b3f30f39ee45065fc18db6ceb486"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
