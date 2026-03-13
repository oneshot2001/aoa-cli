// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AxctlCore",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .library(name: "AxctlCore", targets: ["AxctlCore"])
    ],
    targets: [
        .target(
            name: "AxctlCore",
            linkerSettings: [
                .linkedLibrary("sqlite3")
            ]
        ),
        .testTarget(
            name: "AxctlCoreTests",
            dependencies: ["AxctlCore"]
        )
    ]
)
