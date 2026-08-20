class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.12.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.12.0/crev-darwin-arm64"
      sha256 "a8c03d5e6890ee3c7c8300e559063aa17a38c5d0e30e0e81eb076f25941204af"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.12.0/crev-darwin-x64"
      sha256 "a35b5ca9699dfbb752a20a0edc1e5c720fe28ed1d02ac166d247f9f9e2a646a5"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.12.0/crev-linux-arm64"
      sha256 "5cb68e169f9988dd575b3e8762fd48760625315679e9e24f7c8c9097649e0b78"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.12.0/crev-linux-x64"
      sha256 "97d9a3eba8072f5384b2c65774cd48494ece84356569bec48ef9549131fc947e"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
