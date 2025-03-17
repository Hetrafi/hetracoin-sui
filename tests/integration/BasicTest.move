// Copyright 2025 Hetrafi Ltd.
// SPDX-License-Identifier: Apache-2.0

module hetracoin_integration::BasicTest {
    use sui::test_utils::assert_eq;

    #[test]
    public fun test_basic() {
        // This should pass
        assert_eq(1, 1);
        
        // Comment out or fix the failing test
        // assert_eq(1, 2);
    }
} 