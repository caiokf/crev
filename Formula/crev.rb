class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.4.1"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.1/crev-darwin-arm64"
      sha256 "046d62c32d643efe60e03ac4a9529be1312732dab98ce8b31efbe237699076f6"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.1/crev-darwin-x64"
      sha256 "6f69a98f8f645271472ec168434f7782d0894e7a5f42d2eee4902b6fe1a07693"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.4.1/crev-linux-arm64"
      sha256 "75c48be5979cefa501cb3531eee2443753e4e90421b6545ca5336d173751b862"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.4.1/crev-linux-x64"
      sha256 "28f92f857dba0785123705315eb6d9db650acf2bbc3a675cad75aa932e53e151"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
