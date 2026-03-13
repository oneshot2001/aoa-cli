// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "AxisBar",
    platforms: [
        .macOS(.v14)
    ],
    dependencies: [
        .package(path: "../../packages/core-swift")
    ],
    targets: [
        .executableTarget(
            name: "AxisBar",
            dependencies: [
                .product(name: "AxctlCore", package: "core-swift")
            ],
            linkerSettings: [
                .linkedLibrary("sqlite3")
            ]
        )
    ]
)
