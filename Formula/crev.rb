class Crev < Formula
  desc "Multi-AI code review CLI"
  homepage "https://github.com/caiokf/crev"
  version "0.7.0"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.0/crev-darwin-arm64"
      sha256 "1c70a849042f4ca415dc8d9498efc16d19c01df00da149344d13727784058586"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.0/crev-darwin-x64"
      sha256 "c55b2616ac3754df27f193df0af33acd47c7026c622cfe11468d1dfbaaf30f66"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/caiokf/crev/releases/download/v0.7.0/crev-linux-arm64"
      sha256 "d73e8dd87696bfb35d166983f32a0191ee4e152259244a566093aa0f7df51b69"
    else
      url "https://github.com/caiokf/crev/releases/download/v0.7.0/crev-linux-x64"
      sha256 "8356854720d37e73f78c0cbfabe9fd63d5e328affcdeeb125b17f11df64d014c"
    end
  end

  def install
    bin.install Dir["crev-*"].first => "crev"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/crev --version")
  end
end
